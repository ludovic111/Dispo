-- Keep the legacy genre column readable/writable by older clients.
alter table public.gig_requests add column genres text[];
update public.gig_requests set genres = array[genre];

create function private.sync_gig_genres()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.genres is null then new.genres := array[new.genre]; end if;
  elsif new.genres is not distinct from old.genres and new.genre is distinct from old.genre then
    new.genres := array[new.genre];
  end if;
  if new.genres is null or cardinality(new.genres) = 0 or exists (
    select 1 from unnest(new.genres) x where x is null or btrim(x) = ''
  ) then raise exception 'gig_genre_missing' using errcode = '22023'; end if;
  new.genres := array(select btrim(x) from unnest(new.genres) with ordinality g(x,n)
    group by btrim(x) order by min(n));
  new.genre := new.genres[1];
  return new;
end $$;
revoke all on function private.sync_gig_genres() from public, anon, authenticated;
create trigger gig_00_sync_genres before insert or update of genre, genres
on public.gig_requests for each row execute function private.sync_gig_genres();
alter table public.gig_requests alter column genres set not null;
alter table public.gig_requests add constraint gig_genres_required check (cardinality(genres) > 0);

-- A single canonical comparison shared by profile discovery and SOS matching.
-- Connected identities deduplicate aliases on either side, independent of direction.
create function private.personal_repertoire_overlap(p_a uuid, p_b uuid)
returns table(song_count integer, overlap_percent integer, titles text[], a_count integer, b_count integer)
language sql stable security definer set search_path = '' as $$
  with recursive eligible as materialized (
    select r.id, r.profile_id, r.song from public.personal_repertoire r
    where r.profile_id in (p_a,p_b) and not r.hidden
      and private.can_read_personal_repertoire(p_a)
      and private.can_read_personal_repertoire(p_b)
      and private.can_see_profile(p_a) and private.can_see_profile(p_b)
      and not exists (select 1 from public.profiles p where p.id in (p_a,p_b) and p.moderation_status = 'banned')
  ), edges as materialized (
    select a.id a, b.id b from eligible a join eligible b
      on a.id <> b.id and private.personal_songs_match(a.song,b.song)
  ), reach(root,id) as (
    select id,id from eligible union
    select reach.root,edges.b from reach join edges on edges.a = reach.id
  ), identities as (
    select id, min(root::text) identity from reach group by id
  ), songs as (
    select i.identity, bool_or(e.profile_id=p_a) in_a, bool_or(e.profile_id=p_b) in_b,
      min(btrim(e.song->>'title')) title
    from eligible e join identities i using(id) group by i.identity
  ), counts as (
    select count(*) filter(where in_a)::integer a,
      count(*) filter(where in_b)::integer b,
      count(*) filter(where in_a and in_b)::integer common,
      coalesce((array_agg(title order by title) filter(where in_a and in_b))[1:5], '{}'::text[]) titles
    from songs
  )
  select case when a > 0 and b > 0 then common end,
    case when a > 0 and b > 0 then round(200.0 * common / (a+b))::integer end,
    titles, case when a > 0 and b > 0 then a end, case when a > 0 and b > 0 then b end
  from counts
$$;
revoke all on function private.personal_repertoire_overlap(uuid,uuid) from public, anon, authenticated;

drop function public.profile_common_songs(uuid[]);
create function public.profile_common_songs(p_profiles uuid[])
returns table(profile_id uuid, song_count integer, titles text[], overlap_percent integer, a_count integer, b_count integer)
language sql stable security definer set search_path = '' as $$
  select p.id, o.song_count, o.titles, o.overlap_percent, o.a_count, o.b_count
  from public.profiles p
  cross join lateral private.personal_repertoire_overlap((select auth.uid()),p.id) o
  where (select auth.uid()) is not null and p.id = any(p_profiles)
    and p.id <> (select auth.uid()) and private.can_see_profile(p.id)
    and p.moderation_status <> 'banned'
$$;
revoke all on function public.profile_common_songs(uuid[]) from public, anon;
grant execute on function public.profile_common_songs(uuid[]) to authenticated;

create or replace function private.gig_profile_match(p_gig uuid, p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  g public.gig_requests%rowtype;
  p public.profiles%rowtype;
  h public.profiles%rowtype;
  v_open text[];
  v_instruments text[];
  v_level_ok boolean := false;
  v_day date;
  v_time text;
  v_available boolean := false;
  v_slot_ok boolean := false;
  v_slots jsonb;
  v_away boolean := false;
  v_away_in text;
  v_gig_city text;
  v_school_ok boolean := true;
  v_schools text[] := '{}';
  v_common_genres text[] := '{}';
  v_song_count integer := 0;
  v_song_titles text[] := '{}';
  v_overlap integer;
  v_lat1 double precision;
  v_lon1 double precision;
  v_lat2 double precision;
  v_lon2 double precision;
  v_distance integer;
  v_following boolean := false;
  v_follower boolean := false;
  v_relation text := 'none';
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_genre text;
begin
  if v_viewer is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into g from public.gig_requests where id = p_gig;
  if not found then return null; end if;
  select * into p from public.profiles where id = p_profile;
  if not found then return null; end if;
  select * into h from public.profiles where id = g.host_id;

  -- Instruments : postes encore ouverts que le profil joue.
  v_open := private.gig_open_instruments(g);
  v_instruments := array(
    select i from unnest(v_open) as i where i = any(p.instruments)
  );

  -- Niveau : sur l'un des instruments retenus, niveau déclaré sinon global.
  if coalesce(cardinality(g.wanted_levels), 0) = 0 then
    v_level_ok := true;
  else
    v_level_ok := exists (
      select 1 from unnest(v_instruments) as i
      where coalesce(p.instrument_levels ->> i, p.level) = any(g.wanted_levels)
    );
  end if;

  -- Date et créneau (jour local suisse, comme les dates cochées dans l'app).
  v_day := (g.date at time zone 'Europe/Zurich')::date;
  v_time := to_char(g.date at time zone 'Europe/Zurich', 'HH24:MI');
  v_slots := private.profile_availability_slots(p, v_day);
  v_available := v_slots is not null;
  if v_available then
    if jsonb_typeof(v_slots) = 'array' and jsonb_array_length(v_slots) > 0 then
      v_slot_ok := exists (
        select 1 from jsonb_array_elements(v_slots) as s(value)
        where (s.value ->> 'start') <= v_time and v_time < (s.value ->> 'end')
      );
    end if;
  end if;

  -- Ailleurs : une période de voyage couvre la date, dans une autre ville.
  select l.city into v_gig_city from private.gig_request_locations l where l.gig_id = g.id;
  if nullif(btrim(coalesce(v_gig_city, '')), '') is null then v_gig_city := h.city; end if;
  select nullif(btrim(pl.value ->> 'city'), '') into v_away_in
  from jsonb_array_elements(
    case when jsonb_typeof(p.availability_places) = 'array' then p.availability_places else '[]'::jsonb end
  ) as pl(value)
  where (pl.value ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$'
    and (pl.value ->> 'to') ~ '^\d{4}-\d{2}-\d{2}$'
    and (pl.value ->> 'from')::date <= v_day
    and v_day <= (pl.value ->> 'to')::date
    and nullif(btrim(pl.value ->> 'city'), '') is not null
  order by pl.value ->> 'from' desc
  limit 1;
  if v_away_in is not null
     and lower(v_away_in) is distinct from lower(btrim(coalesce(v_gig_city, p.city, ''))) then
    v_away := true;
  else
    v_away_in := null;
  end if;

  -- École : demandée par le SOS, ou partagée avec l'hôte. Les acronymes
  -- sont exposés à tous les comptes pouvant voir ce profil.
  if cardinality(g.wanted_school_ids) > 0 then
    v_school_ok := exists (
      select 1 from public.music_school_memberships m
      join public.music_schools s on s.id = m.school_id and s.is_active
      where m.profile_id = p.id and m.status = 'active' and m.left_at is null
        and m.school_id = any(g.wanted_school_ids)
    );
  end if;
  v_schools := array(
    select coalesce(nullif(s.short_name, ''), s.name)
    from public.music_school_memberships m
    join public.music_schools s on s.id = m.school_id and s.is_active
    where m.profile_id = p.id and m.status = 'active' and m.left_at is null
      and (
        m.school_id = any(g.wanted_school_ids)
        or exists (
          select 1 from public.music_school_memberships hm
          where hm.profile_id = g.host_id and hm.school_id = m.school_id
            and hm.status = 'active' and hm.left_at is null
        )
      )

    order by s.short_name, s.name
  );

  -- Styles en commun : le style du SOS d'abord, puis ceux de l'hôte.
  v_common_genres := array(
    select x from unnest(p.genres) as x
    where x = any(g.genres) or x = any(coalesce(h.genres, '{}'::text[]))
    order by (x = any(g.genres)) desc, x
  );

  select o.song_count, o.titles, o.overlap_percent
    into v_song_count, v_song_titles, v_overlap
  from private.personal_repertoire_overlap(g.host_id,p.id) o;

  -- Distance : coordonnées de ville des profils (jamais l'adresse exacte
  -- révélée au candidat), lieu du SOS si connu sinon la ville de l'hôte.
  if p.location_precision <> 'hidden' then
    v_lat1 := p.latitude; v_lon1 := p.longitude;
  end if;
  select l.latitude, l.longitude into v_lat2, v_lon2
  from private.gig_request_locations l where l.gig_id = g.id;
  if (v_lat2 is null or v_lon2 is null) and h.location_precision <> 'hidden' then
    v_lat2 := h.latitude; v_lon2 := h.longitude;
  end if;
  if v_lat1 is not null and v_lon1 is not null and v_lat2 is not null and v_lon2 is not null then
    v_distance := round(
      2 * 6371 * asin(
        sqrt(
          power(sin(radians(v_lat2 - v_lat1) / 2), 2)
          + cos(radians(v_lat1)) * cos(radians(v_lat2))
            * power(sin(radians(v_lon2 - v_lon1) / 2), 2)
        )
      )
    )::integer;
  end if;

  -- Relation du point de vue de l'hôte.
  v_following := exists (
    select 1 from public.follows f where f.follower_id = g.host_id and f.following_id = p.id
  );
  v_follower := exists (
    select 1 from public.follows f where f.follower_id = p.id and f.following_id = g.host_id
  );
  v_relation := case
    when v_following and v_follower then 'mutual'
    when v_following then 'following'
    when v_follower then 'follower'
    else 'none'
  end;

  -- Score : un instrument ouvert est obligatoire, sinon 0.
  if cardinality(v_instruments) > 0 then
    v_score := 10;
    v_reasons := array(select 'instrument:' || i from unnest(v_instruments) as i);
    if v_level_ok then
      v_score := v_score + 30; v_reasons := v_reasons || array['level'];
    end if;
    if v_available then
      v_score := v_score + 25; v_reasons := v_reasons || array['available'];
      if v_slot_ok then v_score := v_score + 5; v_reasons := v_reasons || array['time_slot']; end if;
    end if;
    if (cardinality(g.wanted_school_ids) > 0 and v_school_ok) or cardinality(v_schools) > 0 then
      v_score := v_score + 10; v_reasons := v_reasons || array['school'];
    end if;
    if cardinality(v_common_genres) > 0 then
      v_score := v_score + least(10, 5 * cardinality(v_common_genres));
      foreach v_genre in array v_common_genres[1:3] loop
        v_reasons := v_reasons || array['genres:' || v_genre];
      end loop;
    end if;
    if v_song_count > 0 then
      v_score := v_score + least(15, 5 * v_song_count);
      v_reasons := v_reasons || array['songs:' || v_song_count::text];
    end if;
    if v_distance is not null and v_distance <= 10 then
      v_score := v_score + 5; v_reasons := v_reasons || array['near'];
    end if;
    if v_relation = 'mutual' then
      v_score := v_score + 5; v_reasons := v_reasons || array['friend'];
    elsif v_relation <> 'none' then
      v_score := v_score + 3; v_reasons := v_reasons || array['follows'];
    end if;
    if v_away then
      v_score := v_score - 15; v_reasons := v_reasons || array['away'];
    end if;
    v_score := least(100, greatest(0, v_score));
  end if;

  return jsonb_build_object(
    'instruments', to_jsonb(v_instruments),
    'level_ok', v_level_ok,
    'available_on_date', v_available,
    'time_slot_ok', v_slot_ok,
    'away', v_away,
    'away_in', v_away_in,
    'school_ok', v_school_ok,
    'schools', to_jsonb(v_schools),
    'common_genres', to_jsonb(v_common_genres),
    'common_songs', jsonb_build_object('count', v_song_count, 'titles', to_jsonb(v_song_titles), 'overlap_percent', v_overlap),
    'distance_km', v_distance,
    'relation', v_relation,
    'score', v_score,
    'reasons', to_jsonb(v_reasons)
  );
end;
$$;

create or replace function public.update_gig_request(p_gig_id uuid, p_changes jsonb, p_location jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_current public.gig_requests;
  v_instruments text[];
  v_schools uuid[];
  v_date timestamptz := (p_changes->>'date')::timestamptz;
begin
  select * into v_current from public.gig_requests
  where id = p_gig_id and host_id = (select auth.uid()) for update;
  if not found then
    raise exception 'only_gig_host_can_edit' using errcode = '42501';
  end if;
  v_instruments := array(select jsonb_array_elements_text(p_changes->'wanted_instruments'));
  v_schools := array(select jsonb_array_elements_text(coalesce(nullif(p_changes->'wanted_school_ids', 'null'), '[]'))::uuid);
  if length(btrim(coalesce(p_changes->>'title', ''))) not between 1 and 120
    or length(coalesce(p_changes->>'description', '')) > 2000
    or nullif(btrim(p_changes->>'genre'), '') is null
    or cardinality(v_instruments) = 0
    or v_date is null or v_date <= now()
    or (p_changes->>'fee')::integer < 0 then
    raise exception 'invalid_gig_edit' using errcode = '22023';
  end if;
  if not coalesce(v_current.filled_instruments, '{}') <@ v_instruments then
    raise exception 'accepted_instrument_cannot_be_removed' using errcode = '22023';
  end if;
  update public.gig_requests set
    title = btrim(p_changes->>'title'),
    date = case when v_current.event_id is null then v_date else v_current.date end,
    genre = btrim(p_changes->>'genre'),
    genres = case when p_changes ? 'genres' then array(select jsonb_array_elements_text(p_changes->'genres'))
      when btrim(p_changes->>'genre') is distinct from v_current.genre then array[btrim(p_changes->>'genre')] else v_current.genres end,
    description = btrim(coalesce(p_changes->>'description', '')),
    fee = (p_changes->>'fee')::integer,
    payment_method = nullif(btrim(p_changes->>'payment_method'), ''),
    wanted_instruments = v_instruments,
    wanted_levels = array(select jsonb_array_elements_text(coalesce(nullif(p_changes->'wanted_levels', 'null'), '[]'))),
    wanted_school_ids = v_schools,
    neighborhood = case when v_current.event_id is null then p_changes->>'neighborhood' else v_current.neighborhood end,
    place = case when v_current.event_id is null then p_changes->>'place' else v_current.place end,
    public_location_label = case when v_current.event_id is null then p_changes->>'public_location_label' else v_current.public_location_label end
  where id = p_gig_id and host_id = (select auth.uid());
  if v_current.event_id is null then
    perform public.set_gig_request_location(
      p_gig_id, p_location->>'publicLocationLabel',
      nullif(p_location->>'exactAddress', ''), p_location->>'postalCode',
      p_location->>'city', p_location->>'countryCode',
      (p_location->>'latitude')::double precision,
      (p_location->>'longitude')::double precision,
      coalesce((p_location->>'clearExactAddress')::boolean, false)
    );
  end if;
end;
$$;
revoke all on function public.update_gig_request(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_gig_request(uuid, jsonb, jsonb) to authenticated;

create or replace view public.gig_requests_feed
with (security_invoker = true, security_barrier = true)
as
 select g.id,
        g.host_id,
        case when public.can_see_full_gig(g.*) then g.title else null::text end as title,
        g.date,
        case when public.can_see_full_gig(g.*)
          then coalesce(nullif(g.public_location_label, ''), g.place)
          else null::text end as place,
        case when public.can_see_full_gig(g.*) then g.neighborhood else null::text end as neighborhood,
        g.genre,
        g.wanted_instruments,
        case when public.viewer_is_pro() then g.fee else null::integer end as fee,
        case when public.can_see_full_gig(g.*) then g.description else null::text end as description,
        g.posted_at,
        not public.can_see_full_gig(g.*) as is_locked,
        case when public.viewer_is_pro() then g.payment_method else null::text end as payment_method,
        g.filled_instruments,
        g.group_id,
        g.event_id,
        g.target_id,
        g.target_status,
        g.wanted_levels,
        case when public.can_see_full_gig(g.*)
          then coalesce(nullif(g.public_location_label, ''), g.place)
          else null::text end as public_location_label,
        g.wanted_school_ids,
        g.genres
   from public.gig_requests g
  where g.date > now()
    and (
        g.target_id is null
        or g.target_id = (select auth.uid())
        or g.host_id = (select auth.uid())
    )
    and (
        g.host_id = (select auth.uid())
        or g.target_id = (select auth.uid())
        or coalesce(array_length(g.wanted_instruments, 1), 0) = 0
        or not (g.wanted_instruments <@ coalesce(g.filled_instruments, '{}'::text[]))
        or exists (
            select 1
              from public.gig_applications a
             where a.gig_id = g.id
               and a.musician_id = (select auth.uid())
        )
    );

grant select on public.gig_requests_feed to authenticated;



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
  v_genres text[];
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
         case when cardinality(leader.genres)>0 then leader.genres else array['Jazz'] end,
         leader.neighborhood,
         true, -- auto-SOS is free for every tier since 2.5
         coalesce(g.auto_sos_enabled, false)
  into v_leader_id, v_event_title, v_date,
       v_public_label, v_role, v_instruments, v_auto_level, v_profile_level,
       v_instrument_levels, v_genres, v_neighborhood, v_is_premium,
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
      genre, genres, wanted_instruments, wanted_levels, description,
      group_id, event_id, auto_sos_absent_profile_id
    ) values (
      gen_random_uuid(), v_leader_id, v_title, v_date,
      v_public_label, v_public_label, coalesce(v_neighborhood, ''),
      v_genres[1], v_genres, array[v_instrument], v_wanted_levels, v_description,
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
