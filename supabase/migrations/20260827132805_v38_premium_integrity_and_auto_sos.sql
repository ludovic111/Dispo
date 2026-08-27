-- Dispo 2.4 / v38 — invariants Premium, quotas média et auto-SOS idempotent.

-- La visibilité d'un SOS est une brique de liquidité et de sécurité, jamais
-- un avantage Premium. Les offres payantes portent sur l'organisation.
create or replace function public.can_see_full_gig(gig public.gig_requests)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
$$;

revoke all on function public.can_see_full_gig(public.gig_requests)
  from public, anon;
grant execute on function public.can_see_full_gig(public.gig_requests)
  to authenticated;

-- Ne jamais décider la limite à partir de NEW.is_premium : un client pouvait
-- envoyer is_premium=true et six vidéos dans le même PATCH. Le trigger de
-- protection remettait ensuite le booléen à false, trop tard pour les vidéos.
create or replace function public.enforce_demo_video_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  allowed := case when coalesce(old.is_premium, false) then 6 else 1 end;
  if new_count > old_count and new_count > allowed then
    raise exception 'demo_video_limit';
  end if;
  return new;
end;
$$;

-- Les miniatures sont hébergées avec les vidéos. Le bucket reste borné à
-- 50 Mio par objet, puis la policy ci-dessous applique compte + octets par
-- propriétaire (2 objets gratuits, 12 Premium : vidéo + miniature).
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'video/mp4', 'video/quicktime', 'image/jpeg'
    ]
where id = 'demo-videos';

create or replace function private.can_upload_demo_media(
  p_name text,
  p_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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

  select coalesce(p.is_premium, false)
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
$$;

revoke all on function private.can_upload_demo_media(text, jsonb)
  from public, anon;
grant execute on function private.can_upload_demo_media(text, jsonb)
  to authenticated;

drop policy if exists "demo_videos_owner_insert" on storage.objects;
create policy "demo_videos_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'demo-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.can_upload_demo_media(name, metadata)
  );

-- Chaque désistement ne peut produire qu'un SOS automatique, quel que soit
-- le nombre d'appareils/retries. NULL conserve les SOS manuels inchangés.
alter table public.gig_requests
  add column if not exists auto_sos_absent_profile_id uuid
    references public.profiles(id) on delete set null;

create unique index if not exists gig_requests_auto_sos_dropout_uidx
  on public.gig_requests(event_id, auto_sos_absent_profile_id)
  where event_id is not null and auto_sos_absent_profile_id is not null;

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
  v_group_id uuid;
  v_leader_id uuid;
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
  v_wanted_levels text[];
  v_gig_id uuid;
  v_created boolean := false;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120
     or length(coalesce(p_description, '')) > 2000
  then
    raise exception 'invalid_auto_sos_content' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id::text || ':' || p_absent_profile_id::text, 38002)
  );

  select e.group_id, g.leader_id, e.date,
         coalesce(nullif(btrim(e.public_location_label), ''),
                  nullif(btrim(e.venue), ''), 'Lieu communiqué aux participants'),
         m.role, absent.instruments, g.auto_sos_min_level,
         absent.level, absent.instrument_levels,
         coalesce(leader.genres[1], 'Jazz'), leader.neighborhood,
         coalesce(leader.is_premium, false), coalesce(g.auto_sos_enabled, false)
  into v_group_id, v_leader_id, v_date, v_public_label,
       v_role, v_instruments, v_auto_level, v_profile_level,
       v_instrument_levels, v_genre, v_neighborhood,
       v_is_premium, v_auto_enabled
  from public.group_events e
  join public.music_groups g on g.id = e.group_id
  join public.group_members m
    on m.group_id = g.id and m.profile_id = p_absent_profile_id
  join public.profiles absent on absent.id = p_absent_profile_id
  join public.profiles leader on leader.id = g.leader_id
  where e.id = p_event_id
  for update of e, g;

  if not found then
    raise exception 'event_or_absent_member_not_found' using errcode = '22023';
  end if;
  if v_leader_id <> v_user then
    raise exception 'only_group_leader_can_create_auto_sos' using errcode = '42501';
  end if;
  if not v_auto_enabled or not v_is_premium then
    raise exception 'premium_auto_sos_not_enabled' using errcode = '42501';
  end if;
  if v_date <= now() then
    raise exception 'event_already_started' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.event_attendance a
    where a.event_id = p_event_id
      and a.profile_id = p_absent_profile_id
      and a.status = 'unavailable'
  ) then
    raise exception 'member_is_not_unavailable' using errcode = '22023';
  end if;
  if (v_role is not null and p_instrument is distinct from v_role)
     or (v_role is null and not (p_instrument = any(v_instruments)))
  then
    raise exception 'instrument_does_not_belong_to_absent_member'
      using errcode = '22023';
  end if;

  v_wanted_levels := case
    when v_auto_level = 'same' then array[
      coalesce(v_instrument_levels ->> p_instrument, v_profile_level)
    ]
    when v_auto_level in ('Débutant', 'Intermédiaire', 'Avancé', 'Professionnel')
      then array[v_auto_level]
    else null
  end;

  insert into public.gig_requests(
    id, host_id, title, date, place, public_location_label, neighborhood,
    genre, wanted_instruments, wanted_levels, description,
    group_id, event_id, auto_sos_absent_profile_id
  ) values (
    gen_random_uuid(), v_user, btrim(p_title), v_date,
    v_public_label, v_public_label, coalesce(v_neighborhood, ''),
    v_genre, array[p_instrument], v_wanted_levels,
    coalesce(p_description, ''), v_group_id, p_event_id,
    p_absent_profile_id
  )
  on conflict (event_id, auto_sos_absent_profile_id)
    where event_id is not null and auto_sos_absent_profile_id is not null
  do nothing
  returning id into v_gig_id;

  if v_gig_id is null then
    select g.id into v_gig_id
    from public.gig_requests g
    where g.event_id = p_event_id
      and g.auto_sos_absent_profile_id = p_absent_profile_id;
  else
    v_created := true;
  end if;

  -- L'adresse ne traverse jamais gig_requests : elle est copiée dans le
  -- schéma privé, dans la même transaction que le SOS.
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

revoke all on function public.create_auto_sos(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.create_auto_sos(uuid, uuid, text, text, text)
  to authenticated;
