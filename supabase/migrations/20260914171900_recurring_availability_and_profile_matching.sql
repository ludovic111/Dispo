-- Weekly rules use local Swiss weekdays (0=Sunday) and HH:mm windows.
-- Missing weekday = unavailable; [] = all day. Explicit dates take precedence.
alter table public.profiles add column weekly_availability jsonb not null default '{}';

create function private.guard_weekly_availability()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare entry record; slot jsonb;
begin
  if jsonb_typeof(new.weekly_availability) is distinct from 'object' then
    raise exception 'invalid_weekly_availability' using errcode = '22023';
  end if;
  for entry in select * from jsonb_each(new.weekly_availability) loop
    if entry.key !~ '^[0-6]$' or jsonb_typeof(entry.value) is distinct from 'array' then
      raise exception 'invalid_weekly_availability' using errcode = '22023';
    end if;
    for slot in select * from jsonb_array_elements(entry.value) loop
      if jsonb_typeof(slot) is distinct from 'object'
        or coalesce(slot->>'start','') !~ '^(?:[01]\d|2[0-3]):[0-5]\d$'
        or coalesce(slot->>'end','') !~ '^(?:[01]\d|2[0-3]):[0-5]\d$'
        or slot->>'start' >= slot->>'end' then
        raise exception 'invalid_weekly_availability' using errcode = '22023';
      end if;
    end loop;
  end loop;
  return new;
end $$;
revoke all on function private.guard_weekly_availability() from public, anon, authenticated;
create trigger profiles_06_guard_weekly_availability before insert or update of weekly_availability
on public.profiles for each row execute function private.guard_weekly_availability();

create function private.profile_availability_slots(p public.profiles, day date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when day = any(p.available_dates)
    then coalesce(p.availability_time_slots -> day::text, '[]'::jsonb)
    else p.weekly_availability -> extract(dow from day)::integer::text end
$$;
revoke all on function private.profile_availability_slots(public.profiles,date) from public, anon, authenticated;

-- Expose the school identity only. Role, visibility and membership details retain
-- their existing access rules. Never expose blocked or banned profiles.
create function public.profile_school_affiliations(p_profiles uuid[])
returns table(profile_id uuid, school_id uuid, is_primary boolean)
language sql stable security definer set search_path = '' as $$
  select m.profile_id, m.school_id, m.is_primary
  from public.music_school_memberships m
  join public.music_schools s on s.id = m.school_id and s.is_active
  join public.profiles p on p.id = m.profile_id
  where (select auth.uid()) is not null
    and m.profile_id = any(p_profiles) and m.status = 'active' and m.left_at is null
    and private.can_see_profile(m.profile_id)
    and p.moderation_status <> 'banned'
  order by m.profile_id, m.is_primary desc, s.name, s.id
$$;
revoke all on function public.profile_school_affiliations(uuid[]) from public, anon;
grant execute on function public.profile_school_affiliations(uuid[]) to authenticated;

-- Count only the viewer's songs and the candidate's shared repertoire. A hidden
-- song or a private repertoire must never influence a public count or title.
create function public.profile_common_songs(p_profiles uuid[])
returns table(profile_id uuid, song_count integer, titles text[])
language sql stable security definer set search_path = '' as $$
  select p.id, count(r.id)::integer,
    coalesce((array_agg(btrim(r.song->>'title') order by btrim(r.song->>'title')) filter (where r.id is not null))[1:5], '{}'::text[])
  from public.profiles p
  left join public.personal_repertoire r on r.profile_id = p.id and not r.hidden
    and private.can_read_personal_repertoire(p.id)
    and exists (select 1 from public.personal_repertoire mine
      where mine.profile_id = (select auth.uid()) and not mine.hidden
        and private.personal_songs_match(mine.song,r.song))
  where (select auth.uid()) is not null and p.id = any(p_profiles)
    and p.id <> (select auth.uid()) and private.can_see_profile(p.id)
    and p.moderation_status <> 'banned'
  group by p.id
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
  v_personal_reference jsonb := '[]'::jsonb;
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
    where x = g.genre or x = any(coalesce(h.genres, '{}'::text[]))
    order by (x = g.genre) desc, x
  );

  -- Morceaux en commun : répertoire partagé du candidat × setlist liée et
  -- répertoire public de l'hôte. Les répertoires privés restent invisibles.
  v_candidate_readable := p.id = v_viewer or private.can_read_personal_repertoire(p.id);
  if v_candidate_readable then
    if g.event_id is not null then
      select coalesce(e.setlist, '[]'::jsonb) into v_reference
      from public.group_events e where e.id = g.event_id;
      if jsonb_typeof(v_reference) is distinct from 'array' then v_reference := '[]'::jsonb; end if;
    end if;
    if g.host_id = v_viewer or private.can_read_personal_repertoire(g.host_id) then
      select coalesce(jsonb_agg(r.song), '[]'::jsonb) into v_personal_reference
      from public.personal_repertoire r
      where r.profile_id = g.host_id and not r.hidden;
      v_reference := v_reference || v_personal_reference;
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

create or replace function public.queue_gig_push()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  host_name text;
begin
  if new.target_id is not null then
    select coalesce(nullif(p.name, ''), 'Un musicien') into host_name
    from public.profiles p where p.id = new.host_id;

    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    select
      new.target_id, new.host_id, 'sos', 'Demande de dépannage',
      left(host_name || ' te demande de dépanner : ' || new.title, 180),
      jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
      'gig_requests', new.id
    where exists (
        select 1 from public.push_devices d
        where d.user_id = new.target_id and d.notifications_enabled and d.sos_enabled
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = new.target_id and b.blocked_id = new.host_id)
           or (b.blocker_id = new.host_id and b.blocked_id = new.target_id)
      )
    on conflict do nothing;
    return new;
  end if;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    p.id,
    new.host_id,
    'sos',
    'Nouveau SOS compatible',
    left(new.title || case when new.place <> '' then ' · ' || new.place else '' end, 180),
    jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
    'gig_requests',
    new.id
  from public.profiles p
  where p.id <> new.host_id
    and (p.weekly_availability <> '{}'::jsonb or exists (
      select 1 from unnest(p.available_dates) as dispo(day)
      where dispo.day >= current_date
    ))
    and (cardinality(new.wanted_school_ids) = 0 or exists (
      select 1 from public.music_school_memberships m
      join public.music_schools s on s.id = m.school_id and s.is_active
      where m.profile_id = p.id and m.status = 'active' and m.left_at is null
        and m.school_id = any(new.wanted_school_ids)
    ))
    and p.instruments && new.wanted_instruments
    -- Le niveau demandé, s'il y en a un : niveau global OU niveau déclaré
    -- sur l'un des instruments recherchés.
    and (
      new.wanted_levels is null
      or cardinality(new.wanted_levels) = 0
      or p.level = any(new.wanted_levels)
      or exists (
        select 1
          from jsonb_each_text(coalesce(p.instrument_levels, '{}'::jsonb)) as il(inst, lvl)
         where il.inst = any(new.wanted_instruments)
           and il.lvl = any(new.wanted_levels)
      )
    )
    and exists (
      select 1 from public.push_devices d
      where d.user_id = p.id and d.notifications_enabled and d.sos_enabled
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p.id and b.blocked_id = new.host_id)
         or (b.blocker_id = new.host_id and b.blocked_id = p.id)
    )
  on conflict do nothing;
  return new;
end;
$function$;

