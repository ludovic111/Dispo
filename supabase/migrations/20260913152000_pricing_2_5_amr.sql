-- Dispo 2.5 — pricing: monthly-only plans, free automation for every tier,
-- Premium capped at 6 led groups, AMR workshop groups always free and an AMR
-- Premium grant window (2026-10-01 → 2027-01-31). Idempotent: every statement
-- can be replayed on a database where part of it already exists.

-- ---------------------------------------------------------------------------
-- 1. Schools: free workshop window and AMR seed.
-- ---------------------------------------------------------------------------
alter table public.music_schools
  add column if not exists free_workshops_until date;
comment on column public.music_schools.free_workshops_until is
  'Jusqu''à cette date incluse, un membre actif peut créer et diriger des groupes d''atelier de cette école sans abonnement.';

update public.music_schools
set free_workshops_until = date '2028-12-31'
where slug = 'amr-geneve'
  and free_workshops_until is distinct from date '2028-12-31';

-- ---------------------------------------------------------------------------
-- 2. Workshop groups: music_groups.school_id.
-- ---------------------------------------------------------------------------
alter table public.music_groups
  add column if not exists school_id uuid references public.music_schools(id) on delete set null;
comment on column public.music_groups.school_id is
  'Groupe d''atelier d''une école : gratuit pour ses membres actifs pendant la fenêtre free_workshops_until, hors quota des formules payantes.';
create index if not exists music_groups_school_id_idx
  on public.music_groups(school_id) where school_id is not null;

-- ---------------------------------------------------------------------------
-- 3. School Premium grants (AMR: 1 October 2026 → 31 January 2027).
-- ---------------------------------------------------------------------------
create table if not exists public.school_premium_grants (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.music_schools(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
comment on table public.school_premium_grants is
  'Fenêtres pendant lesquelles les membres actifs d''une école bénéficient de Premium sans achat. Lecture seule côté client.';
create index if not exists school_premium_grants_school_window_idx
  on public.school_premium_grants(school_id, starts_at, ends_at);
alter table public.school_premium_grants enable row level security;
revoke all on public.school_premium_grants from public, anon, authenticated;
grant select on public.school_premium_grants to authenticated;
drop policy if exists school_premium_grants_select_authenticated on public.school_premium_grants;
create policy school_premium_grants_select_authenticated
  on public.school_premium_grants for select to authenticated using (true);

insert into public.school_premium_grants(school_id, starts_at, ends_at, note)
select s.id,
       timestamptz '2026-10-01 00:00:00 Europe/Zurich',
       timestamptz '2027-01-31 23:59:59 Europe/Zurich',
       'Offre de lancement AMR : Premium offert aux membres actifs.'
from public.music_schools s
where s.slug = 'amr-geneve'
  and not exists (
    select 1 from public.school_premium_grants g
    where g.school_id = s.id
      and g.starts_at = timestamptz '2026-10-01 00:00:00 Europe/Zurich'
  );

-- ---------------------------------------------------------------------------
-- 4. Tier resolution: store purchase or an active school grant.
-- ---------------------------------------------------------------------------
create or replace function private.active_school_grant(p_profile uuid, p_at timestamptz default now())
returns table(school_id uuid, school_short_name text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.school_id, coalesce(s.short_name, s.name), g.starts_at, g.ends_at
  from public.school_premium_grants g
  join public.music_schools s on s.id = g.school_id and s.is_active
  join public.music_school_memberships m
    on m.school_id = g.school_id and m.profile_id = p_profile and m.status = 'active'
  where p_profile is not null
    and g.starts_at <= p_at and g.ends_at > p_at
  order by g.ends_at desc, g.school_id
  limit 1
$$;
create or replace function private.upcoming_school_grant(p_profile uuid, p_at timestamptz default now())
returns table(school_id uuid, school_short_name text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.school_id, coalesce(s.short_name, s.name), g.starts_at, g.ends_at
  from public.school_premium_grants g
  join public.music_schools s on s.id = g.school_id and s.is_active
  join public.music_school_memberships m
    on m.school_id = g.school_id and m.profile_id = p_profile and m.status = 'active'
  where p_profile is not null
    and g.starts_at > p_at
  order by g.starts_at, g.school_id
  limit 1
$$;
revoke all on function private.active_school_grant(uuid, timestamptz), private.upcoming_school_grant(uuid, timestamptz)
  from public, anon, authenticated;

create or replace function private.store_subscription_tier(p_profile uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.tier from private.subscription_state s
    where s.profile_id = p_profile and s.expires_at > now()), 'free')
$$;
revoke all on function private.store_subscription_tier(uuid) from public, anon, authenticated;

create or replace function private.subscription_tier(p_profile uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from private.active_school_grant(p_profile)) then 'premium'
    else private.store_subscription_tier(p_profile)
  end
$$;
create or replace function private.has_active_premium(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.subscription_tier(p_profile) = 'premium'
$$;
revoke all on function private.subscription_tier(uuid), private.has_active_premium(uuid) from public, anon;
grant execute on function private.subscription_tier(uuid), private.has_active_premium(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Group limits: Premium ≤ 6 led groups, Groupe 1, free 0 ; workshop groups
--    of an eligible school never count and are open to every tier.
-- ---------------------------------------------------------------------------
create or replace function private.can_lead_workshop_group(p_profile uuid, p_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_profile is not null and p_school is not null and exists (
    select 1
    from public.music_schools s
    join public.music_school_memberships m
      on m.school_id = s.id and m.profile_id = p_profile and m.status = 'active'
    where s.id = p_school
      and s.is_active
      and s.free_workshops_until is not null
      and s.free_workshops_until >= current_date
  )
$$;
revoke all on function private.can_lead_workshop_group(uuid, uuid) from public, anon, authenticated;

drop function if exists private.can_lead_another_group(uuid);
create or replace function private.can_lead_another_group(p_profile uuid, p_school uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_school is not null then private.can_lead_workshop_group(p_profile, p_school)
    else case private.subscription_tier(p_profile)
      when 'premium' then
        (select count(*) from public.music_groups g where g.leader_id = p_profile and g.school_id is null) < 6
      when 'group' then
        not exists (select 1 from public.music_groups g where g.leader_id = p_profile and g.school_id is null)
      else false
    end
  end
$$;
revoke all on function private.can_lead_another_group(uuid, uuid) from public, anon, authenticated;

drop policy if exists music_groups_insert_paid on public.music_groups;
drop function if exists public.can_create_music_group();
create or replace function public.can_create_music_group(p_school uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and private.can_lead_another_group((select auth.uid()), p_school)
$$;
revoke all on function public.can_create_music_group(uuid) from public, anon;
grant execute on function public.can_create_music_group(uuid) to authenticated;
create policy music_groups_insert_paid on public.music_groups for insert to authenticated
with check (leader_id = (select auth.uid()) and public.can_create_music_group(school_id));

create or replace function private.enforce_music_group_creation_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return new; end if;
  if new.leader_id <> v_user then raise exception 'group_leader_must_be_current_user' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,37001));
  if new.school_id is not null then
    if not private.can_lead_workshop_group(v_user, new.school_id) then
      raise exception 'school_workshop_not_available' using errcode='42501';
    end if;
    return new;
  end if;
  if not private.can_lead_another_group(v_user, null) then
    raise exception 'subscription_required_for_group' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_music_group_creation_limit() from public, anon, authenticated;

-- A group cannot switch between workshop and regular after creation from the
-- client: that would bypass the paid quota in either direction.
create or replace function private.enforce_music_group_school_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.school_id is distinct from old.school_id then
    raise exception 'group_school_immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_music_group_school_immutable() from public, anon, authenticated;
drop trigger if exists music_groups_01_school_immutable on public.music_groups;
create trigger music_groups_01_school_immutable
before update of school_id on public.music_groups
for each row execute function private.enforce_music_group_school_immutable();

CREATE OR REPLACE FUNCTION public.transfer_group_leadership(p_group_id uuid, p_new_leader_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_current_leader uuid;
  v_school_id uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 37002));

  select g.leader_id, g.school_id into v_current_leader, v_school_id
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

  if not private.can_lead_another_group(p_new_leader_id, v_school_id) then
    raise exception 'subscription_required_for_group' using errcode='42501';
  end if;

  update public.music_groups
  set leader_id = p_new_leader_id
  where id = p_group_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 6. Automation is free for every tier: only the leader check remains.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_auto_sos_premium()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return new; end if;
  if tg_op = 'UPDATE'
     and new.auto_sos_enabled is not distinct from old.auto_sos_enabled
     and new.auto_sos_min_level is not distinct from old.auto_sos_min_level
  then return new; end if;
  if new.leader_id <> v_user then
    raise exception 'only_group_leader_can_configure_auto_sos' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_auto_sos_premium() from public, anon, authenticated;

create or replace function private.enforce_recurring_event_premium()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_is_leader boolean;
begin
  if v_user is null then return new; end if;
  if tg_op = 'UPDATE' and new.reminder_lead_days is not distinct from old.reminder_lead_days then
    return new;
  end if;
  if tg_op = 'INSERT' and new.series_id is null and coalesce(new.reminder_lead_days, 2) = 2 then
    return new;
  end if;
  -- Range validation stays on the column check constraint (0..60 days).
  select g.leader_id = v_user into v_is_leader
  from public.music_groups g where g.id = new.group_id;
  if not coalesce(v_is_leader, false) then
    raise exception 'only_group_leader_can_configure_event' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_recurring_event_premium() from public, anon, authenticated;

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
         true, -- auto-SOS is free for every tier since 2.5
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

  if not v_auto_enabled then
    if p_strict then
      raise exception 'auto_sos_not_enabled' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- 7. get_my_subscription(): source, school grant, workshop schools.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_subscription()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  grant_now as (select * from private.active_school_grant((select id from me))),
  grant_next as (select * from private.upcoming_school_grant((select id from me)))
  select jsonb_build_object(
    'tier', private.subscription_tier(me.id),
    'source', case
      when exists (select 1 from grant_now) then 'school_grant'
      when private.store_subscription_tier(me.id) <> 'free' then 'store'
      else 'none' end,
    'expires_at', case
      when exists (select 1 from grant_now) then (select ends_at from grant_now)
      else (select s.expires_at from private.subscription_state s where s.profile_id = me.id) end,
    'school_short_name', (select school_short_name from grant_now),
    'upcoming_school_grant', (
      select jsonb_build_object('school_short_name', n.school_short_name, 'starts_at', n.starts_at, 'ends_at', n.ends_at)
      from grant_next n),
    'group_count', (select count(*) from public.music_groups g where g.leader_id = me.id and g.school_id is null),
    'workshop_group_count', (select count(*) from public.music_groups g where g.leader_id = me.id and g.school_id is not null),
    'workshop_schools', coalesce((
      select jsonb_agg(jsonb_build_object('school_id', s.id, 'school_short_name', coalesce(s.short_name, s.name), 'free_workshops_until', s.free_workshops_until) order by s.name)
      from public.music_schools s
      join public.music_school_memberships m on m.school_id = s.id and m.profile_id = me.id and m.status = 'active'
      where s.is_active and s.free_workshops_until is not null and s.free_workshops_until >= current_date
    ), '[]'::jsonb))
  from me
  where me.id is not null
$$;
revoke all on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Keep profiles.is_premium mirrored for school grants (memberships change,
--    windows open and close without any store webhook).
-- ---------------------------------------------------------------------------
create or replace function private.refresh_profile_premium(p_profile uuid)
returns void language sql security definer set search_path = '' as $$
  update public.profiles p
  set is_premium = private.has_active_premium(p.id)
  where p.id = p_profile
    and p.is_premium is distinct from private.has_active_premium(p.id)
$$;
revoke all on function private.refresh_profile_premium(uuid) from public, anon, authenticated;

create or replace function private.refresh_profile_premium_on_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform private.refresh_profile_premium(new.profile_id); end if;
  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or old.profile_id is distinct from new.profile_id) then
    perform private.refresh_profile_premium(old.profile_id);
  end if;
  return null;
end;
$$;
revoke all on function private.refresh_profile_premium_on_membership() from public, anon, authenticated;
drop trigger if exists music_school_memberships_90_refresh_premium on public.music_school_memberships;
create trigger music_school_memberships_90_refresh_premium
after insert or update or delete on public.music_school_memberships
for each row execute function private.refresh_profile_premium_on_membership();

create or replace function private.refresh_all_profile_premium()
returns integer language sql security definer set search_path = '' as $$
  with changed as (
    update public.profiles p
    set is_premium = private.has_active_premium(p.id)
    where p.is_premium is distinct from private.has_active_premium(p.id)
    returning 1)
  select count(*)::integer from changed
$$;
revoke all on function private.refresh_all_profile_premium() from public, anon, authenticated;

do $$
declare v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron missing: daily Premium refresh job not scheduled';
    return;
  end if;
  for v_job_id in
    select j.jobid from cron.job j where j.jobname = 'dispo-refresh-profile-premium-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'dispo-refresh-profile-premium-daily',
    '5 0 * * *',
    'select private.refresh_all_profile_premium();'
  );
end;
$$;

select private.refresh_all_profile_premium();

-- Auto-SOS is free: reconcile the groups that already had it switched on.
do $$
declare v_group_id uuid;
begin
  for v_group_id in
    select g.id from public.music_groups g where g.auto_sos_enabled order by g.id
  loop
    perform private.reconcile_auto_sos_for_group(v_group_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
