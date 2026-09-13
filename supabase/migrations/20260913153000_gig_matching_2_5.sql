-- Dispo 2.5 — matching SOS précis côté serveur.
-- Idempotent : rejouable sur une base déjà migrée.
--
-- 1. private.gig_profile_match(gig, profil) : instrument, niveau, date et
--    créneau, absence (« ailleurs »), école, styles, morceaux en commun
--    (répertoires personnels publics / setlist liée), distance, relation,
--    score 0-100 et raisons lisibles par machine.
-- 2. public.gig_candidates / gig_candidate_count / gig_applicants (hôte
--    seulement), public.my_gig_matches (fil « Pour moi » du viewer).
-- 3. Garde à la candidature : poste ouvert, instrument joué, niveau demandé,
--    date future, pas son propre SOS, pas de blocage.
-- 4. Contact unique d'un candidat par l'hôte (conversation + premier message).
-- 5. Pas de demande directe en double vers la même personne.
-- 6. Retrait d'un SOS : nettoyage des notifications et avis aux candidats.

alter table public.gig_applications
  add column if not exists host_contacted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Helpers privés
-- ---------------------------------------------------------------------------

create or replace function private.gig_open_instruments(g public.gig_requests)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(
    array(
      select i from unnest(g.wanted_instruments) as i
      where i <> all(coalesce(g.filled_instruments, '{}'::text[]))
    ),
    '{}'::text[]
  );
$$;
revoke all on function private.gig_open_instruments(public.gig_requests) from public, anon, authenticated;

create or replace function private.gig_profile_summary(p public.profiles)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'photo_url', p.photo_url,
    'level', p.level,
    'instruments', to_jsonb(p.instruments),
    'genres', to_jsonb(p.genres),
    'city', p.city,
    'is_premium', p.is_premium
  );
$$;
revoke all on function private.gig_profile_summary(public.profiles) from public, anon, authenticated;

create or replace function private.gig_blocked_pair(a uuid, b uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;
revoke all on function private.gig_blocked_pair(uuid, uuid) from public, anon, authenticated;

-- Le score est calculé pour le viewer authentifié : les répertoires privés
-- ne sont comptés que si private.can_read_personal_repertoire l'autorise.
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
  v_reference jsonb := '[]'::jsonb;
  v_candidate_readable boolean := false;
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
  v_available := v_day = any(p.available_dates);
  if v_available then
    v_slots := p.availability_time_slots -> v_day::text;
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

  -- École : demandée par le SOS, ou partagée avec l'hôte. Les acronymes ne
  -- sont exposés que si l'affiliation est visible du viewer.
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
      and (
        p.id = v_viewer
        or m.visibility = 'profile'
        or (m.visibility = 'school_only' and private.is_active_school_member(m.school_id))
      )
    order by s.short_name, s.name
  );

  -- Styles en commun : le style du SOS d'abord, puis ceux de l'hôte.
  v_common_genres := array(
    select x from unnest(p.genres) as x
    where x = g.genre or x = any(coalesce(h.genres, '{}'::text[]))
    order by (x = g.genre) desc, x
  );

  -- Morceaux en commun : répertoire public du candidat × setlist liée ou
  -- répertoire public de l'hôte. Les répertoires privés restent invisibles.
  v_candidate_readable := p.id = v_viewer or private.can_read_personal_repertoire(p.id);
  if v_candidate_readable then
    if g.event_id is not null then
      select coalesce(e.setlist, '[]'::jsonb) into v_reference
      from public.group_events e where e.id = g.event_id;
      if jsonb_typeof(v_reference) is distinct from 'array' then v_reference := '[]'::jsonb; end if;
    elsif g.host_id = v_viewer or private.can_read_personal_repertoire(g.host_id) then
      select coalesce(jsonb_agg(r.song), '[]'::jsonb) into v_reference
      from public.personal_repertoire r
      where r.profile_id = g.host_id and not r.hidden;
    end if;
    if g.host_id <> p.id and jsonb_array_length(v_reference) > 0 then
      select count(*)::integer,
             coalesce((array_agg(c.title order by c.title))[1:5], '{}'::text[])
        into v_song_count, v_song_titles
      from (
        select distinct on (r.id) btrim(r.song ->> 'title') as title, r.id
        from public.personal_repertoire r
        cross join jsonb_array_elements(v_reference) as ref(song)
        where r.profile_id = p.id and not r.hidden
          and jsonb_typeof(ref.song) = 'object'
          and private.personal_songs_match(r.song, ref.song)
      ) as c;
    end if;
  end if;

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
    'common_songs', jsonb_build_object('count', v_song_count, 'titles', to_jsonb(v_song_titles)),
    'distance_km', v_distance,
    'relation', v_relation,
    'score', v_score,
    'reasons', to_jsonb(v_reasons)
  );
end;
$$;
revoke all on function private.gig_profile_match(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC exposées
-- ---------------------------------------------------------------------------

create or replace function public.gig_candidates(p_gig uuid, p_limit integer default 50)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  g public.gig_requests%rowtype;
  v_open text[];
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into g from public.gig_requests where id = p_gig;
  if not found or g.host_id <> v_viewer then
    raise exception 'only_gig_host' using errcode = '42501';
  end if;
  v_open := private.gig_open_instruments(g);
  return query
    select jsonb_build_object('profile', private.gig_profile_summary(p), 'match', m.match)
    from public.profiles p
    cross join lateral (select private.gig_profile_match(p_gig, p.id) as match) as m
    where p.id <> g.host_id
      and not p.is_demo
      and length(btrim(p.name)) >= 2
      and cardinality(p.instruments) > 0
      and p.instruments && v_open
      and not private.gig_blocked_pair(g.host_id, p.id)
      and not exists (
        select 1 from public.gig_applications a where a.gig_id = p_gig and a.musician_id = p.id
      )
      and (cardinality(g.wanted_school_ids) = 0 or exists (
        select 1 from public.music_school_memberships ms
        where ms.profile_id = p.id and ms.status = 'active' and ms.left_at is null
          and ms.school_id = any(g.wanted_school_ids)
      ))
    order by (m.match ->> 'score')::integer desc,
             (m.match ->> 'available_on_date')::boolean desc,
             p.name
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.gig_candidates(uuid, integer) from public, anon;
grant execute on function public.gig_candidates(uuid, integer) to authenticated;

-- Compteur léger pour le talon vert du ticket (aucun score calculé).
create or replace function public.gig_candidate_count(p_gig uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  g public.gig_requests%rowtype;
  v_open text[];
  v_count integer;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into g from public.gig_requests where id = p_gig;
  if not found or g.host_id <> v_viewer then
    raise exception 'only_gig_host' using errcode = '42501';
  end if;
  v_open := private.gig_open_instruments(g);
  if cardinality(v_open) = 0 or g.date <= now() then return 0; end if;
  select count(*)::integer into v_count
  from public.profiles p
  where p.id <> g.host_id
    and not p.is_demo
    and length(btrim(p.name)) >= 2
    and p.instruments && v_open
    and not private.gig_blocked_pair(g.host_id, p.id)
    and not exists (
      select 1 from public.gig_applications a where a.gig_id = p_gig and a.musician_id = p.id
    )
    and (cardinality(g.wanted_school_ids) = 0 or exists (
      select 1 from public.music_school_memberships ms
      where ms.profile_id = p.id and ms.status = 'active' and ms.left_at is null
        and ms.school_id = any(g.wanted_school_ids)
    ))
    and (
      coalesce(cardinality(g.wanted_levels), 0) = 0
      or exists (
        select 1 from unnest(v_open) as i
        where i = any(p.instruments)
          and coalesce(p.instrument_levels ->> i, p.level) = any(g.wanted_levels)
      )
    );
  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.gig_candidate_count(uuid) from public, anon;
grant execute on function public.gig_candidate_count(uuid) to authenticated;

create or replace function public.gig_applicants(p_gig uuid)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  v_host uuid;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select host_id into v_host from public.gig_requests where id = p_gig;
  if v_host is null or v_host <> v_viewer then
    raise exception 'only_gig_host' using errcode = '42501';
  end if;
  return query
    select jsonb_build_object(
      'application', jsonb_build_object(
        'id', a.id,
        'gig_id', a.gig_id,
        'musician_id', a.musician_id,
        'instrument', a.instrument,
        'message', a.message,
        'status', a.status,
        'created_at', a.created_at,
        'host_contacted_at', a.host_contacted_at
      ),
      'profile', private.gig_profile_summary(p),
      'match', private.gig_profile_match(p_gig, p.id)
    )
    from public.gig_applications a
    join public.profiles p on p.id = a.musician_id
    where a.gig_id = p_gig
    order by a.created_at, a.id;
end;
$$;
revoke all on function public.gig_applicants(uuid) from public, anon;
grant execute on function public.gig_applicants(uuid) to authenticated;

-- Fil « Pour moi » : SOS visibles du viewer où il joue un poste ouvert.
create or replace function public.my_gig_matches(p_limit integer default 100)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  p public.profiles%rowtype;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into p from public.profiles where id = v_viewer;
  if not found or cardinality(p.instruments) = 0 then return; end if;
  return query
    select jsonb_build_object(
      'gig', jsonb_build_object(
        'id', g.id,
        'date', g.date,
        'title', g.title,
        'host_id', g.host_id,
        'target_id', g.target_id,
        'wanted_instruments', to_jsonb(g.wanted_instruments),
        'filled_instruments', to_jsonb(coalesce(g.filled_instruments, '{}'::text[]))
      ),
      'match', m.match
    )
    from public.gig_requests g
    cross join lateral (select private.gig_profile_match(g.id, v_viewer) as match) as m
    where g.date > now()
      and g.host_id <> v_viewer
      and (g.target_id is null or g.target_id = v_viewer)
      and p.instruments && private.gig_open_instruments(g)
      and not private.gig_blocked_pair(g.host_id, v_viewer)
      and jsonb_array_length(coalesce(m.match -> 'instruments', '[]'::jsonb)) > 0
    order by (m.match ->> 'score')::integer desc, g.date asc, g.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.my_gig_matches(integer) from public, anon;
grant execute on function public.my_gig_matches(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Garde à la candidature
-- ---------------------------------------------------------------------------

create or replace function private.guard_gig_application_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  g public.gig_requests%rowtype;
  p public.profiles%rowtype;
  v_open text[];
begin
  select * into g from public.gig_requests where id = new.gig_id;
  if not found then
    raise exception 'gig_not_found' using errcode = '22023';
  end if;
  if new.musician_id = g.host_id then
    raise exception 'cannot_apply_own_gig' using errcode = '22023';
  end if;
  if g.date <= now() then
    raise exception 'gig_expired' using errcode = '22023';
  end if;
  if private.gig_blocked_pair(g.host_id, new.musician_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  -- Une demande directe acceptée est déjà validée par l'hôte : l'instrument
  -- est celui qu'il a choisi, le niveau n'est pas rediscuté.
  if g.target_id is not null and g.target_id = new.musician_id then
    return new;
  end if;
  v_open := private.gig_open_instruments(g);
  if new.instrument is null or new.instrument <> all(v_open) then
    raise exception 'instrument_not_open' using errcode = '22023';
  end if;
  select * into p from public.profiles where id = new.musician_id;
  if not found or new.instrument <> all(p.instruments) then
    raise exception 'instrument_not_played' using errcode = '22023';
  end if;
  if coalesce(cardinality(g.wanted_levels), 0) > 0
     and coalesce(p.instrument_levels ->> new.instrument, p.level) <> all(g.wanted_levels) then
    raise exception 'level_not_wanted' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_gig_application_insert() from public, anon, authenticated;

drop trigger if exists gig_applications_00_guard_insert on public.gig_applications;
create trigger gig_applications_00_guard_insert
  before insert on public.gig_applications
  for each row execute function private.guard_gig_application_insert();

-- ---------------------------------------------------------------------------
-- Contact unique d'un candidat
-- ---------------------------------------------------------------------------

create or replace function public.contact_gig_applicant(p_application uuid, p_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  a public.gig_applications%rowtype;
  g public.gig_requests%rowtype;
  v_text text := btrim(coalesce(p_text, ''));
  v_a uuid;
  v_b uuid;
  v_conversation uuid;
  v_prefix text;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into a from public.gig_applications where id = p_application for update;
  if not found then raise exception 'application_not_found' using errcode = '22023'; end if;
  select * into g from public.gig_requests where id = a.gig_id;
  if not found or g.host_id <> v_viewer then
    raise exception 'only_gig_host' using errcode = '42501';
  end if;
  if a.host_contacted_at is not null then
    raise exception 'already_contacted' using errcode = '22023';
  end if;
  if length(v_text) < 1 or length(v_text) > 500 then
    raise exception 'message_invalid' using errcode = '22023';
  end if;
  if private.gig_blocked_pair(v_viewer, a.musician_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  v_a := least(v_viewer, a.musician_id);
  v_b := greatest(v_viewer, a.musician_id);
  insert into public.conversations (participant_a, participant_b)
  values (v_a, v_b)
  on conflict (participant_a, participant_b) do nothing;
  select c.id into v_conversation
  from public.conversations c
  where c.participant_a = v_a and c.participant_b = v_b;

  v_prefix := 'À propos de ton SOS « ' || g.title || ' » ('
    || to_char(g.date at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI') || ') : ';
  insert into public.messages (conversation_id, sender_id, text)
  values (v_conversation, v_viewer, left(v_prefix || v_text, 4000));

  update public.gig_applications
     set host_contacted_at = now()
   where id = p_application;
  return v_conversation;
end;
$$;
revoke all on function public.contact_gig_applicant(uuid, text) from public, anon;
grant execute on function public.contact_gig_applicant(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pas de demande directe en double
-- ---------------------------------------------------------------------------

create or replace function private.guard_direct_gig_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_id is null then return new; end if;
  if new.target_id = new.host_id then
    raise exception 'cannot_target_self' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.gig_requests g
    where g.host_id = new.host_id
      and g.target_id = new.target_id
      and g.target_status = 'pending'
      and g.date >= now()
      and g.id <> new.id
  ) then
    raise exception 'direct_request_pending' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_direct_gig_request() from public, anon, authenticated;

drop trigger if exists gig_requests_00_guard_direct_target on public.gig_requests;
create trigger gig_requests_00_guard_direct_target
  before insert on public.gig_requests
  for each row execute function private.guard_direct_gig_request();

-- ---------------------------------------------------------------------------
-- Retrait d'un SOS : notifications nettoyées, candidats prévenus
-- ---------------------------------------------------------------------------

create or replace function private.cleanup_deleted_gig_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_host_name text;
begin
  -- Les candidats (en attente ou pris) apprennent le retrait ; les lignes
  -- de candidature partent ensuite par cascade, d'où le BEFORE DELETE.
  if old.date > now() then
    select coalesce(nullif(p.name, ''), 'Un musicien') into v_host_name
    from public.profiles p where p.id = old.host_id;
    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    select
      a.musician_id, old.host_id, 'sos', 'SOS retiré',
      left(v_host_name || ' a retiré « ' || old.title || ' ».', 180),
      jsonb_build_object('category', 'sos', 'target_tab', 'sos'),
      'gig_requests_removed', old.id
    from public.gig_applications a
    where a.gig_id = old.id
      and a.status in ('pending', 'accepted')
      and exists (
        select 1 from public.push_devices d
        where d.user_id = a.musician_id and d.notifications_enabled and d.sos_enabled
      )
      and not private.gig_blocked_pair(old.host_id, a.musician_id)
    on conflict do nothing;
  end if;
  delete from public.push_notifications n
   where n.source_id = old.id
     and n.source_table in ('gig_requests', 'gig_requests_response');
  return old;
end;
$$;
revoke all on function private.cleanup_deleted_gig_request() from public, anon, authenticated;

drop trigger if exists gig_requests_00_cleanup_delete on public.gig_requests;
create trigger gig_requests_00_cleanup_delete
  before delete on public.gig_requests
  for each row execute function private.cleanup_deleted_gig_request();
