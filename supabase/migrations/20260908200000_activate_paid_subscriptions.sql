-- Paid launch: only canonical, expiring App Store purchases grant new capabilities.
-- Existing groups, memberships and repertoire rows are retained after expiry.
create table private.subscription_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('free','group','premium')),
  expires_at timestamptz,
  checked_at timestamptz not null,
  applied_at timestamptz not null default now(),
  check ((tier = 'free' and expires_at is null) or (tier <> 'free' and expires_at is not null))
);
alter table private.subscription_state enable row level security;
revoke all on private.subscription_state from public, anon, authenticated;

create function private.subscription_tier(p_profile uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.tier from private.subscription_state s
    where s.profile_id = p_profile and s.expires_at > now()), 'free')
$$;
create function private.has_active_premium(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.subscription_tier(p_profile) = 'premium'
$$;
revoke all on function private.subscription_tier(uuid), private.has_active_premium(uuid) from public, anon;
grant execute on function private.subscription_tier(uuid), private.has_active_premium(uuid) to authenticated;

create function public.get_my_subscription()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tier', private.subscription_tier((select auth.uid())),
    'expires_at', (select expires_at from private.subscription_state where profile_id = (select auth.uid())),
    'group_count', (select count(*) from public.music_groups where leader_id = (select auth.uid())))
  where (select auth.uid()) is not null
$$;
revoke all on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated;

create function public.apply_revenuecat_subscription_state(
  p_profile_id uuid, p_tier text, p_expires_at timestamptz, p_checked_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_applied uuid;
begin
  if p_profile_id is null or p_tier is null or p_tier not in ('free','group','premium')
    or p_checked_at is null or p_checked_at > now() + interval '5 minutes'
    or (p_tier = 'free' and p_expires_at is not null)
    or (p_tier <> 'free' and (p_expires_at is null or p_expires_at <= p_checked_at))
  then raise exception 'invalid_subscription_state' using errcode = '22023'; end if;
  insert into private.subscription_state(profile_id,tier,expires_at,checked_at)
  values(p_profile_id,p_tier,p_expires_at,p_checked_at)
  on conflict(profile_id) do update set tier=excluded.tier, expires_at=excluded.expires_at,
    checked_at=excluded.checked_at, applied_at=now()
    where excluded.checked_at > private.subscription_state.checked_at
  returning profile_id into v_applied;
  if v_applied is null then return false; end if;
  update public.profiles set is_premium=private.has_active_premium(p_profile_id) where id=p_profile_id;
  return true;
end;
$$;
revoke all on function public.apply_revenuecat_subscription_state(uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_revenuecat_subscription_state(uuid,text,timestamptz,timestamptz) to service_role;
-- Prevent the obsolete boolean-only webhook path from bypassing expiry checks.
revoke all on function public.apply_revenuecat_premium_state(uuid,boolean,timestamptz) from service_role;

drop trigger if exists profiles_00_enforce_beta_premium on public.profiles;
drop function private.enforce_beta_premium();
alter table public.profiles alter column is_premium set default false;
update public.profiles set is_premium = false where is_premium;
create or replace function public.protect_premium_flag()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    new.is_premium := private.has_active_premium(new.id);
  end if;
  return new;
end;
$$;
drop trigger profiles_protect_premium on public.profiles;
create trigger profiles_protect_premium before insert or update on public.profiles
for each row execute function public.protect_premium_flag();

create function private.can_lead_another_group(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case private.subscription_tier(p_profile)
    when 'premium' then true
    when 'group' then not exists(select 1 from public.music_groups where leader_id=p_profile)
    else false end
$$;
revoke all on function private.can_lead_another_group(uuid) from public, anon, authenticated;
create or replace function public.can_create_music_group()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.can_lead_another_group((select auth.uid()))
$$;
drop policy music_groups_insert_first_free_or_premium on public.music_groups;
create policy music_groups_insert_paid on public.music_groups for insert to authenticated
with check (leader_id=(select auth.uid()) and public.can_create_music_group());
create or replace function private.enforce_music_group_creation_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return new; end if;
  if new.leader_id <> v_user then raise exception 'group_leader_must_be_current_user' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,37001));
  if not private.can_lead_another_group(v_user) then
    raise exception 'subscription_required_for_group' using errcode='42501';
  end if;
  return new;
end;
$$;

-- Owner access and removal remain possible after expiry. Sharing and editing
-- require Premium; expiry automatically hides a formerly public repertoire.
create or replace function private.can_read_personal_repertoire(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (p_owner=(select auth.uid()) or (
    private.has_active_premium(p_owner)
    and exists(select 1 from public.personal_repertoire_settings s where s.profile_id=p_owner and s.is_public)
    and exists(select 1 from public.profiles p where p.id=p_owner and length(btrim(p.name))>=2 and cardinality(p.instruments)>0)
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=p_owner and b.blocked_id=(select auth.uid())) or
      (b.blocked_id=p_owner and b.blocker_id=(select auth.uid())))
  ))
$$;
create function private.guard_personal_repertoire_edit()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') or private.has_active_premium(new.profile_id) then return new; end if;
  if tg_table_name='personal_repertoire_settings' then
    if not new.is_public then return new; end if;
  elsif new.mastery is not distinct from old.mastery and new.style is not distinct from old.style
    and (new.hidden or new.hidden is not distinct from old.hidden) then return new;
  end if;
  raise exception 'premium_required_for_personal_repertoire' using errcode='42501';
end;
$$;
revoke all on function private.guard_personal_repertoire_edit() from public, anon, authenticated;
create trigger personal_repertoire_edit_subscription before update on public.personal_repertoire
for each row execute function private.guard_personal_repertoire_edit();
create trigger personal_repertoire_visibility_subscription before insert or update on public.personal_repertoire_settings
for each row execute function private.guard_personal_repertoire_edit();

-- Expiry is checked at each privileged operation, independently of webhook delivery.
CREATE OR REPLACE FUNCTION private.enforce_auto_sos_premium()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_premium boolean;
begin
  -- Imports/migrations de service restent possibles ; leurs secrets et leur
  -- responsabilité sont hors de la surface cliente authentifiée.
  if v_user is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.auto_sos_enabled is not distinct from old.auto_sos_enabled
     and new.auto_sos_min_level is not distinct from old.auto_sos_min_level
  then
    return new;
  end if;
  if new.leader_id <> v_user then
    raise exception 'only_group_leader_can_configure_auto_sos'
      using errcode = '42501';
  end if;
  if not coalesce(new.auto_sos_enabled, false) then
    return new;
  end if;

  select private.has_active_premium(p.id) into v_premium
  from public.profiles p where p.id = v_user;
  if not coalesce(v_premium, false) then
    raise exception 'premium_required_for_auto_sos' using errcode = '42501';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.enforce_recurring_event_premium()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_is_leader boolean;
  v_premium boolean;
begin
  if v_user is null then
    return new;
  end if;

  -- Après expiration, une série existante reste éditable. Pour le rappel,
  -- revenir au délai gratuit de deux jours reste toujours possible.
  if tg_op = 'UPDATE'
     and new.reminder_lead_days is not distinct from old.reminder_lead_days
  then
    return new;
  end if;
  if tg_op = 'INSERT'
     and new.series_id is null
     and coalesce(new.reminder_lead_days, 2) = 2
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 37003));

  select g.leader_id = v_user, private.has_active_premium(p.id)
  into v_is_leader, v_premium
  from public.music_groups g
  join public.profiles p on p.id = g.leader_id
  where g.id = new.group_id;

  if not coalesce(v_is_leader, false) then
    raise exception 'only_group_leader_can_configure_event'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.series_id is not null
     and not coalesce(v_premium, false)
  then
    raise exception 'premium_required_for_recurring_events' using errcode = '42501';
  end if;
  if coalesce(new.reminder_lead_days, 2) <> 2
     and not coalesce(v_premium, false)
  then
    raise exception 'premium_required_for_configurable_reminders'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.can_upload_demo_media(p_name text, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_extension text := lower(coalesce(storage.extension(p_name), ''));
  v_size_text text := coalesce(p_metadata ->> 'size', '');
  v_size bigint;
  v_is_premium boolean;
  v_object_limit integer;
  v_byte_limit bigint;
  v_existing_count bigint;
  v_existing_bytes bigint;
begin
  if v_user is null or p_name not like v_user::text || '/%' then
    return false;
  end if;

  if v_extension in ('jpg', 'jpeg') then
    v_size := case when v_size_text ~ '^[0-9]+$'
      then v_size_text::bigint else 1048576 end;
    if v_size < 1 or v_size > 1048576 then return false; end if;
  elsif v_extension in ('mp4', 'mov') then
    v_size := case when v_size_text ~ '^[0-9]+$'
      then v_size_text::bigint else 52428800 end;
    if v_size < 1 or v_size > 52428800 then return false; end if;
  else
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 38001));

  select private.has_active_premium(p.id)
  into v_is_premium
  from public.profiles p
  where p.id = v_user;

  v_object_limit := case when coalesce(v_is_premium, false) then 12 else 2 end;
  v_byte_limit := case when coalesce(v_is_premium, false)
    then 325058560 -- 310 Mio
    else 57671680  -- 55 Mio
  end;

  select count(*), coalesce(sum(
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      when lower(coalesce(storage.extension(o.name), '')) in ('jpg', 'jpeg')
        then 1048576
      else 52428800
    end
  ), 0)
  into v_existing_count, v_existing_bytes
  from storage.objects o
  where o.bucket_id = 'demo-videos'
    and o.name like v_user::text || '/%';

  return v_existing_count < v_object_limit
    and v_existing_bytes + v_size <= v_byte_limit;
exception
  when others then
    -- Un format de metadata inattendu ferme l'upload au lieu d'ouvrir un
    -- chemin non borné. Les suppressions restent possibles pour récupérer.
    return false;
end;
$function$;


CREATE OR REPLACE FUNCTION private.create_auto_sos_for_dropout(p_event_id uuid, p_absent_profile_id uuid, p_expected_leader_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_requested_instrument text DEFAULT NULL::text, p_strict boolean DEFAULT false)
 RETURNS TABLE(gig_id uuid, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
  v_leader_id uuid;
  v_event_title text;
  v_date timestamptz;
  v_public_label text;
  v_role text;
  v_instruments text[];
  v_auto_level text;
  v_profile_level text;
  v_instrument_levels jsonb;
  v_genre text;
  v_neighborhood text;
  v_is_premium boolean;
  v_auto_enabled boolean;
  v_instrument text;
  v_same_level text;
  v_wanted_levels text[];
  v_title text;
  v_description text;
  v_gig_id uuid;
  v_created boolean := false;
  v_previous_link_marker text;
  v_known_instruments constant text[] := array[
    'Piano', 'Synthé / MAO', 'Orgue', 'Accordéon',
    'Guitare', 'Guitare électrique', 'Basse', 'Contrebasse', 'Violon',
    'Alto', 'Violoncelle', 'Harpe', 'Banjo', 'Mandoline', 'Ukulélé',
    'Saxophone', 'Saxophone alto', 'Saxophone ténor', 'Trompette',
    'Trombone', 'Clarinette', 'Flûte', 'Cor', 'Tuba', 'Harmonica',
    'Batterie', 'Percussions', 'Cajón', 'Congas', 'Timbales', 'Vibraphone',
    'Voix', 'Chœurs', 'Beatbox', 'DJ / Platines'
  ]::text[];
begin
  if p_event_id is null or p_absent_profile_id is null then
    if p_strict then
      raise exception 'invalid_auto_sos_dropout' using errcode = '22023';
    end if;
    return;
  end if;

  -- Le groupe est toujours verrouille avant l'advisory lock. Cet ordre reste
  -- identique quand l'appel vient du trigger d'activation (qui detient deja la
  -- ligne du groupe) et evite une inversion de locks avec un desistement
  -- concurrent. L'index unique reste la derniere barriere d'idempotence.
  select e.group_id into v_group_id
  from public.group_events e
  where e.id = p_event_id;
  if not found then
    if p_strict then
      raise exception 'event_or_absent_member_not_found' using errcode = '22023';
    end if;
    return;
  end if;

  perform 1
  from public.music_groups g
  where g.id = v_group_id
  for update;
  if not found then
    if p_strict then
      raise exception 'event_or_absent_member_not_found' using errcode = '22023';
    end if;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id::text || ':' || p_absent_profile_id::text, 42001)
  );

  select g.leader_id, e.title, e.date,
         coalesce(
           nullif(btrim(e.public_location_label), ''),
           nullif(btrim(e.venue), ''),
           'Lieu communiqué aux participants'
         ),
         nullif(btrim(m.role), ''), absent.instruments,
         g.auto_sos_min_level, absent.level, absent.instrument_levels,
         coalesce(nullif(leader.genres[1], ''), 'Jazz'),
         leader.neighborhood,
         private.has_active_premium(leader.id),
         coalesce(g.auto_sos_enabled, false)
  into v_leader_id, v_event_title, v_date,
       v_public_label, v_role, v_instruments, v_auto_level, v_profile_level,
       v_instrument_levels, v_genre, v_neighborhood, v_is_premium,
       v_auto_enabled
  from public.group_events e
  join public.music_groups g on g.id = e.group_id
  join public.profiles leader on leader.id = g.leader_id
  join public.profiles absent on absent.id = p_absent_profile_id
  left join public.group_members m
    on m.group_id = g.id and m.profile_id = p_absent_profile_id
  where e.id = p_event_id
    and e.group_id = v_group_id
    -- Le leader est un membre fonctionnel du groupe même si une ancienne
    -- donnée n'a pas sa ligne group_members. Tout autre profil doit être un
    -- membre réel : une présence orpheline ne suffit jamais.
    and (p_absent_profile_id = g.leader_id or m.profile_id is not null)
  for update of e;

  if not found then
    if p_strict then
      raise exception 'event_or_absent_member_not_found' using errcode = '22023';
    end if;
    return;
  end if;

  if p_expected_leader_id is not null
     and v_leader_id <> p_expected_leader_id
  then
    if p_strict then
      raise exception 'only_group_leader_can_create_auto_sos'
        using errcode = '42501';
    end if;
    return;
  end if;

  if not v_auto_enabled or not v_is_premium then
    if p_strict then
      raise exception 'premium_auto_sos_not_enabled' using errcode = '42501';
    end if;
    return;
  end if;

  if v_date <= now() then
    if p_strict then
      raise exception 'event_already_started' using errcode = '22023';
    end if;
    return;
  end if;

  if not exists (
    select 1
    from public.event_attendance a
    where a.event_id = p_event_id
      and a.profile_id = p_absent_profile_id
      and a.status = 'unavailable'
  ) then
    if p_strict then
      raise exception 'member_is_not_unavailable' using errcode = '22023';
    end if;
    return;
  end if;

  -- Le rôle du groupe est la source la plus précise. À défaut, l'ordre du
  -- profil est stable et fournit un repli déterministe. Les deux sources sont
  -- filtrees par le vocabulaire partage iOS/Android : `role` est un texte
  -- historique libre et ne doit jamais injecter un poste impossible a matcher.
  if v_role is not null and not (v_role = any(v_known_instruments)) then
    v_role := null;
  end if;
  if p_requested_instrument is null then
    v_instrument := v_role;
    if v_instrument is null then
      select btrim(candidate.instrument)
      into v_instrument
      from unnest(coalesce(v_instruments, array[]::text[]))
        with ordinality candidate(instrument, ordinal)
      where nullif(btrim(candidate.instrument), '') is not null
        and btrim(candidate.instrument) = any(v_known_instruments)
      order by candidate.ordinal
      limit 1;
    end if;
  else
    v_instrument := nullif(btrim(p_requested_instrument), '');
    if v_instrument is null
       or not (v_instrument = any(v_known_instruments))
       or (v_role is not null and v_instrument is distinct from v_role)
       or (
         v_role is null
         and not (v_instrument = any(coalesce(v_instruments, array[]::text[])))
       )
    then
      if p_strict then
        raise exception 'instrument_does_not_belong_to_absent_member'
          using errcode = '22023';
      end if;
      return;
    end if;
  end if;

  if v_instrument is null then
    if p_strict then
      raise exception 'absent_member_instrument_missing' using errcode = '22023';
    end if;
    return;
  end if;

  v_same_level := v_instrument_levels ->> v_instrument;
  if v_same_level is null
     or v_same_level not in ('Débutant', 'Intermédiaire', 'Avancé', 'Professionnel')
  then
    v_same_level := v_profile_level;
  end if;
  if v_same_level is null
     or v_same_level not in ('Débutant', 'Intermédiaire', 'Avancé', 'Professionnel')
  then
    v_same_level := null;
  end if;
  v_wanted_levels := case
    when v_auto_level = 'same' and v_same_level is not null
      then array[v_same_level]
    when v_auto_level in ('Débutant', 'Intermédiaire', 'Avancé', 'Professionnel')
      then array[v_auto_level]
    else null
  end;

  v_title := case
    when p_title is null
      then left('Remplacement · ' || v_event_title, 120)
    else btrim(p_title)
  end;
  v_description := case
    when p_description is null
      then 'SOS automatique : un poste vient de se libérer pour cet événement.'
    else coalesce(p_description, '')
  end;
  if length(v_title) not between 1 and 120
     or length(v_description) > 2000
  then
    if p_strict then
      raise exception 'invalid_auto_sos_content' using errcode = '22023';
    end if;
    return;
  end if;

  v_previous_link_marker := current_setting('dispo.auto_sos_server', true);
  perform set_config('dispo.auto_sos_server', 'on', true);
  begin
    insert into public.gig_requests(
      id, host_id, title, date, place, public_location_label, neighborhood,
      genre, wanted_instruments, wanted_levels, description,
      group_id, event_id, auto_sos_absent_profile_id
    ) values (
      gen_random_uuid(), v_leader_id, v_title, v_date,
      v_public_label, v_public_label, coalesce(v_neighborhood, ''),
      v_genre, array[v_instrument], v_wanted_levels, v_description,
      v_group_id, p_event_id, p_absent_profile_id
    )
    on conflict (event_id, auto_sos_absent_profile_id)
      where event_id is not null and auto_sos_absent_profile_id is not null
    do nothing
    returning id into v_gig_id;
  exception when others then
    perform set_config(
      'dispo.auto_sos_server', coalesce(v_previous_link_marker, ''), true
    );
    raise;
  end;
  perform set_config(
    'dispo.auto_sos_server', coalesce(v_previous_link_marker, ''), true
  );

  if v_gig_id is null then
    select g.id into v_gig_id
    from public.gig_requests g
    where g.event_id = p_event_id
      and g.auto_sos_absent_profile_id = p_absent_profile_id;
  else
    v_created := true;
  end if;

  -- Un transfert de leadership ne doit pas laisser la gestion des candidats
  -- a l'ancien leader. Cette mise a niveau ne vise que la ligne Auto-SOS
  -- dedupliquee ; les annonces manuelles du groupe gardent leur auteur.
  update public.gig_requests g
  set host_id = v_leader_id
  where g.id = v_gig_id and g.host_id is distinct from v_leader_id;

  -- L'adresse exacte ne traverse jamais la ligne publique ni Realtime. Sa
  -- copie reste atomique avec le SOS et accessible uniquement via les RPC v37.
  insert into private.gig_request_locations(
    gig_id, exact_address, postal_code, city, country_code,
    latitude, longitude, updated_at
  )
  select v_gig_id, l.exact_address, l.postal_code, l.city, l.country_code,
         l.latitude, l.longitude, now()
  from private.group_event_locations l
  where l.event_id = p_event_id
  on conflict on constraint gig_request_locations_pkey do update
  set exact_address = excluded.exact_address,
      postal_code = excluded.postal_code,
      city = excluded.city,
      country_code = excluded.country_code,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = now();

  return query select v_gig_id, v_created;
end;
$function$;


CREATE OR REPLACE FUNCTION private.reconcile_auto_sos_for_group(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dropout record;
  v_created boolean;
  v_created_count integer := 0;
begin
  if not exists (
    select 1
    from public.music_groups g
    join public.profiles leader on leader.id = g.leader_id
    where g.id = p_group_id
      and g.auto_sos_enabled
      and private.has_active_premium(leader.id)
  ) then
    return 0;
  end if;

  for v_dropout in
    select a.event_id, a.profile_id
    from public.event_attendance a
    join public.group_events e on e.id = a.event_id
    join public.music_groups g on g.id = e.group_id
    where e.group_id = p_group_id
      and e.date > now()
      and a.status = 'unavailable'
      and (
        a.profile_id = g.leader_id
        or exists (
          select 1 from public.group_members m
          where m.group_id = g.id and m.profile_id = a.profile_id
        )
      )
    order by e.date, a.event_id, a.profile_id
  loop
    v_created := false;
    select result.created into v_created
    from private.create_auto_sos_for_dropout(
      v_dropout.event_id,
      v_dropout.profile_id,
      null,
      null,
      null,
      null,
      false
    ) result;
    if coalesce(v_created, false) then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return v_created_count;
end;
$function$;


CREATE OR REPLACE FUNCTION public.enforce_demo_video_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  new_count int;
  old_count int;
  allowed int;
begin
  if jsonb_typeof(new.demo_videos) is distinct from 'array' then
    raise exception 'demo_videos must be a JSON array';
  end if;
  if pg_column_size(new.demo_videos) > 8192 then
    raise exception 'demo_videos payload too large';
  end if;
  new_count := jsonb_array_length(new.demo_videos);
  old_count := coalesce(jsonb_array_length(old.demo_videos), 0);
  allowed := case when private.has_active_premium(old.id) then 6 else 1 end;
  if new_count > old_count and new_count > allowed then
    raise exception 'demo_video_limit';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.transfer_group_leadership(p_group_id uuid, p_new_leader_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_current_leader uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 37002));

  select g.leader_id into v_current_leader
  from public.music_groups g
  where g.id = p_group_id
  for update;

  if not found then
    raise exception 'group_not_found' using errcode = '22023';
  end if;
  if v_current_leader <> v_user then
    raise exception 'only_current_leader_can_transfer' using errcode = '42501';
  end if;
  if p_new_leader_id = v_current_leader then
    return;
  end if;
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id
      and m.profile_id = p_new_leader_id
      and m.kind = 'permanent'
  ) then
    raise exception 'new_leader_must_be_permanent_member' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_new_leader_id::text, 37001));

  if not private.can_lead_another_group(p_new_leader_id) then
    raise exception 'subscription_required_for_group' using errcode='42501';
  end if;

  update public.music_groups
  set leader_id = p_new_leader_id
  where id = p_group_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.add_personal_song(p_song jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid := (select auth.uid()); v_payload jsonb; v_id uuid;
begin
  if not private.has_active_premium((select auth.uid())) then
    raise exception 'premium_required_for_personal_repertoire' using errcode='42501';
  end if;
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if jsonb_typeof(p_song) is distinct from 'object' or coalesce(length(btrim(p_song->>'title')),0) not between 1 and 200
    or length(coalesce(p_song->>'artist','')) > 200 or pg_column_size(p_song) > 16384
  then raise exception 'invalid_song' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 54001));
  v_payload := private.personal_song_payload(p_song) || jsonb_build_object('title', btrim(p_song->>'title'), 'artist', btrim(coalesce(p_song->>'artist','')));
  select id into v_id from public.personal_repertoire where profile_id=v_owner
    and private.personal_songs_match(song,v_payload) order by hidden desc,created_at,id limit 1;
  if v_id is not null then
    update public.personal_repertoire set hidden=false,origin='manual',song=v_payload where id=v_id;
  else
    insert into public.personal_repertoire(profile_id,song,identity,origin)
    values(v_owner,v_payload,private.personal_song_identity(v_payload),'manual') returning id into v_id;
  end if;
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.update_personal_arrangement(p_id uuid, p_changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid := (select auth.uid()); v_changes jsonb;
begin
  if not private.has_active_premium((select auth.uid())) then
    raise exception 'premium_required_for_personal_repertoire' using errcode='42501';
  end if;
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or pg_column_size(p_changes) > 4096
    or exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('title','artist','key','tempo_bpm','form'))
  then raise exception 'invalid_arrangement' using errcode = '22023'; end if;
  if (p_changes ? 'title' and (jsonb_typeof(p_changes->'title') is distinct from 'string' or coalesce(length(btrim(p_changes->>'title')),0) not between 1 and 200))
    or (p_changes ? 'artist' and (jsonb_typeof(p_changes->'artist') is distinct from 'string' or length(p_changes->>'artist') > 200))
    or (p_changes ? 'key' and p_changes->'key' <> 'null'::jsonb and (jsonb_typeof(p_changes->'key') <> 'string' or length(p_changes->>'key') > 20))
    or (p_changes ? 'form' and p_changes->'form' <> 'null'::jsonb and (jsonb_typeof(p_changes->'form') <> 'string' or length(p_changes->>'form') > 500))
    or (p_changes ? 'tempo_bpm' and p_changes->'tempo_bpm' <> 'null'::jsonb and (jsonb_typeof(p_changes->'tempo_bpm') <> 'number' or (p_changes->>'tempo_bpm') !~ '^[0-9]+$'))
  then raise exception 'invalid_arrangement' using errcode = '22023'; end if;
  if p_changes ? 'tempo_bpm' and p_changes->'tempo_bpm' <> 'null'::jsonb then
    if (p_changes->>'tempo_bpm')::numeric not between 1 and 400 then
      raise exception 'invalid_tempo' using errcode = '22023';
    end if;
  end if;
  v_changes := p_changes;
  if v_changes ? 'title' then v_changes := jsonb_set(v_changes,'{title}',to_jsonb(btrim(v_changes->>'title'))); end if;
  if v_changes ? 'artist' then v_changes := jsonb_set(v_changes,'{artist}',to_jsonb(btrim(v_changes->>'artist'))); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 54001));
  update public.personal_repertoire set arrangement = arrangement || v_changes
    where id = p_id and profile_id = v_owner and not hidden;
  if not found then raise exception 'song_not_found' using errcode = '42501'; end if;
end;
$function$;


notify pgrst, 'reload schema';
