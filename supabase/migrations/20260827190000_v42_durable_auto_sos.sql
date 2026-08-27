-- Dispo 2.4 / v42 — Auto-SOS durable, transactionnel et indépendant du client.
--
-- v38 sécurisait l'RPC appelée par les apps, mais le désistement restait
-- détecté côté client. Cette migration déplace l'orchestration dans Postgres :
-- le passage à `unavailable`, l'activation de l'option et un nouvel octroi
-- Premium convergent tous vers le même noyau idempotent.

-- Le garde v26 exigeait que le JWT courant soit celui du leader. C'était juste
-- pour un insert client, mais cela bloque légitimement le nouveau trigger qui
-- s'exécute sous le JWT du membre absent. Un marqueur transactionnel privé,
-- posé uniquement autour de l'insert par le noyau ci-dessous, distingue cette
-- écriture serveur sans affaiblir le contrat des clients existants.
create or replace function public.normalize_linked_gig_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_internal_auto_sos boolean := coalesce(
    current_setting('dispo.auto_sos_server', true) = 'on', false
  );
  v_event public.group_events%rowtype;
begin
  if new.event_id is null then
    return new;
  end if;

  select * into v_event
  from public.group_events e
  where e.id = new.event_id;

  if not found then
    raise exception 'linked_event_not_found' using errcode = '23503';
  end if;

  -- Defense en profondeur : meme si le marqueur transactionnel interne etait
  -- pose par erreur ailleurs, il ne peut autoriser qu'une ligne Auto-SOS
  -- clairement attribuee au leader reel de l'evenement.
  if v_internal_auto_sos and (
    new.auto_sos_absent_profile_id is null
    or not exists (
      select 1
      from public.music_groups g
      where g.id = v_event.group_id and g.leader_id = new.host_id
    )
  ) then
    raise exception 'invalid_internal_auto_sos_link' using errcode = '42501';
  end if;

  if v_uid is not null and not v_internal_auto_sos and not exists (
    select 1
    from public.music_groups g
    where g.id = v_event.group_id and g.leader_id = v_uid
  ) then
    raise exception 'only_leader_can_link_gig_to_event' using errcode = '42501';
  end if;

  new.group_id := v_event.group_id;
  new.date := v_event.date;
  if v_event.venue <> '' then
    new.place := v_event.venue;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_linked_gig_event()
  from public, anon, authenticated;

-- Noyau unique. L'RPC publique et les triggers l'utilisent tous les deux afin
-- que les règles de Premium, appartenance, instrument et confidentialité ne
-- puissent jamais diverger.
create or replace function private.create_auto_sos_for_dropout(
  p_event_id uuid,
  p_absent_profile_id uuid,
  p_expected_leader_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_requested_instrument text default null,
  p_strict boolean default false
)
returns table(gig_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
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
         coalesce(leader.is_premium, false),
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
$$;

revoke all on function private.create_auto_sos_for_dropout(
  uuid, uuid, uuid, text, text, text, boolean
) from public, anon, authenticated;

-- Contrat public v38 conservé pour les clients déjà livrés. Il n'est plus
-- nécessaire au fonctionnement serveur, mais reste une reprise manuelle sûre.
create or replace function public.create_auto_sos(
  p_event_id uuid,
  p_absent_profile_id uuid,
  p_title text,
  p_description text,
  p_instrument text
)
returns table(gig_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120
     or length(coalesce(p_description, '')) > 2000
  then
    raise exception 'invalid_auto_sos_content' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_instrument, '')), '') is null then
    raise exception 'instrument_does_not_belong_to_absent_member'
      using errcode = '22023';
  end if;

  return query
  select result.gig_id, result.created
  from private.create_auto_sos_for_dropout(
    p_event_id,
    p_absent_profile_id,
    v_user,
    p_title,
    coalesce(p_description, ''),
    p_instrument,
    true
  ) result;
end;
$$;

revoke all on function public.create_auto_sos(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.create_auto_sos(uuid, uuid, text, text, text)
  to authenticated;

-- Si le membre redevient disponible, une annonce automatique sans engagement
-- n'a plus de raison d'exister. Les candidatures sont verrouillees avant le
-- gig pour ne jamais courir contre une acceptation : un remplacement deja
-- confirme est conserve et reste sous le controle explicite du leader.
create or replace function private.retire_uncommitted_auto_sos(
  p_event_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gig_id uuid;
  v_has_filled_slot boolean;
begin
  select g.id into v_gig_id
  from public.gig_requests g
  where g.event_id = p_event_id
    and g.auto_sos_absent_profile_id = p_profile_id;
  if not found then
    return false;
  end if;

  -- Meme ordre que le parcours d'acceptation : candidature(s), puis gig.
  perform 1
  from public.gig_applications a
  where a.gig_id = v_gig_id
  order by a.id
  for update;

  select cardinality(coalesce(g.filled_instruments, array[]::text[])) > 0
  into v_has_filled_slot
  from public.gig_requests g
  where g.id = v_gig_id
  for update;
  if not found then
    return false;
  end if;

  if v_has_filled_slot or exists (
    select 1
    from public.gig_applications a
    where a.gig_id = v_gig_id and a.status = 'accepted'
  ) then
    return false;
  end if;

  -- Le centre in-app ne doit pas garder un deep link vers un SOS retire. Les
  -- push deja remis par APNs/FCM ne sont evidemment pas retractables.
  delete from public.push_notifications pn
  where (pn.source_table = 'gig_requests' and pn.source_id = v_gig_id)
     or (
       pn.source_table in ('gig_applications', 'gig_application_status')
       and exists (
         select 1 from public.gig_applications a
         where a.gig_id = v_gig_id and a.id = pn.source_id
       )
     );

  delete from public.gig_requests g where g.id = v_gig_id;
  return found;
end;
$$;

revoke all on function private.retire_uncommitted_auto_sos(uuid, uuid)
  from public, anon, authenticated;

-- Une transition de présence suffit désormais, même si aucun appareil du
-- leader n'est connecté. En cas d'erreur inattendue, toute la transition est
-- annulée : il n'existe jamais d'état « absent enregistré, automatisation à
-- moitié exécutée ». Les gardes métier normales sont, elles, des no-op.
create or replace function private.create_auto_sos_on_unavailable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'unavailable'
     and (tg_op = 'INSERT' or old.status is distinct from 'unavailable')
  then
    perform private.create_auto_sos_for_dropout(
      new.event_id,
      new.profile_id,
      null,
      null,
      null,
      null,
      false
    );
  elsif tg_op = 'UPDATE'
        and old.status = 'unavailable'
        and new.status = 'available'
  then
    perform private.retire_uncommitted_auto_sos(new.event_id, new.profile_id);
  end if;
  return new;
end;
$$;

revoke all on function private.create_auto_sos_on_unavailable()
  from public, anon, authenticated;

drop trigger if exists event_attendance_durable_auto_sos
  on public.event_attendance;
create trigger event_attendance_durable_auto_sos
after insert or update of status on public.event_attendance
for each row execute function private.create_auto_sos_on_unavailable();

-- Réconciliation ciblée : elle couvre une option activée après le
-- désistement, un octroi Premium ultérieur et le backfill de déploiement.
create or replace function private.reconcile_auto_sos_for_group(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
      and leader.is_premium
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
$$;

revoke all on function private.reconcile_auto_sos_for_group(uuid)
  from public, anon, authenticated;

create or replace function private.reconcile_auto_sos_on_group_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.leader_id is distinct from old.leader_id then
    update public.gig_requests g
    set host_id = new.leader_id
    where g.group_id = new.id
      and g.event_id is not null
      and g.auto_sos_absent_profile_id is not null
      and g.host_id is distinct from new.leader_id;
  end if;

  if new.auto_sos_enabled and (
    not coalesce(old.auto_sos_enabled, false)
    or new.leader_id is distinct from old.leader_id
  )
  then
    perform private.reconcile_auto_sos_for_group(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.reconcile_auto_sos_on_group_change()
  from public, anon, authenticated;

drop trigger if exists music_groups_20_reconcile_auto_sos
  on public.music_groups;
create trigger music_groups_20_reconcile_auto_sos
after update of auto_sos_enabled, leader_id on public.music_groups
for each row execute function private.reconcile_auto_sos_on_group_change();

-- Le webhook RevenueCat met déjà le miroir à jour via l'RPC v40. Ce trigger
-- ne réécrit jamais le profil et ne rappelle jamais RevenueCat : il réconcilie
-- seulement les groupes lors d'un passage false -> true, sans boucle possible.
create or replace function private.reconcile_auto_sos_on_premium_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  if new.is_premium and not coalesce(old.is_premium, false) then
    for v_group_id in
      select g.id
      from public.music_groups g
      where g.leader_id = new.id and g.auto_sos_enabled
      order by g.id
    loop
      perform private.reconcile_auto_sos_for_group(v_group_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.reconcile_auto_sos_on_premium_grant()
  from public, anon, authenticated;

drop trigger if exists profiles_20_reconcile_auto_sos_on_premium
  on public.profiles;
create trigger profiles_20_reconcile_auto_sos_on_premium
after update of is_premium on public.profiles
for each row execute function private.reconcile_auto_sos_on_premium_grant();

-- Une seule reprise à l'application de v42 couvre les indisponibilités qui
-- existaient déjà avec Premium + auto-SOS actifs. L'index partiel v38 rend ce
-- backfill rejouable et les triggers de gig_requests réutilisent le push actuel.
do $$
declare
  v_group_id uuid;
begin
  for v_group_id in
    select g.id
    from public.music_groups g
    join public.profiles leader on leader.id = g.leader_id
    where g.auto_sos_enabled and leader.is_premium
    order by g.id
  loop
    perform private.reconcile_auto_sos_for_group(v_group_id);
  end loop;
end;
$$;
