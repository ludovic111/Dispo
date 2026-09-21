-- Public is the default; explicit privacy choices are preserved.
begin;
alter table public.personal_repertoire_settings alter column is_public set default true;

create or replace function private.can_read_personal_repertoire(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (p_owner = (select auth.uid()) or (
    coalesce((select s.is_public from public.personal_repertoire_settings s where s.profile_id = p_owner), true)
    and private.can_see_profile(p_owner)
    and exists(select 1 from public.profiles p where p.id = p_owner and p.moderation_status <> 'banned')
  ))
$$;

-- Visitors may see the visibility flag, never the songs of a private repertoire.
drop policy personal_repertoire_settings_read on public.personal_repertoire_settings;
create policy personal_repertoire_settings_read on public.personal_repertoire_settings
for select to authenticated using (profile_id = (select auth.uid()) or private.can_see_profile(profile_id));

-- Compare hidden-free personal songs even in private libraries. Only the totals
-- leave the database when either library cannot be read by the current viewer.
create or replace function private.personal_repertoire_overlap(p_a uuid, p_b uuid)
returns table(song_count integer, overlap_percent integer, titles text[], a_count integer, b_count integer)
language sql stable security definer set search_path = '' as $$
  with recursive eligible as materialized (
    select r.id, r.profile_id, r.song from public.personal_repertoire r
    where r.profile_id in (p_a,p_b) and not r.hidden
      and (select auth.uid()) is not null
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
    case when private.can_read_personal_repertoire(p_a) and private.can_read_personal_repertoire(p_b)
      then titles else '{}'::text[] end, case when a > 0 and b > 0 then a end, case when a > 0 and b > 0 then b end
  from counts
$$;
revoke all on function private.personal_repertoire_overlap(uuid,uuid) from public, anon, authenticated;

-- Group creation can only copy songs whose owners allow the caller to read them.
-- The caller explicitly chooses to share their own common songs with the group.
create function private.group_common_repertoire(p_profiles uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := (select auth.uid());
  v_profiles uuid[];
  v_unavailable integer;
  v_songs jsonb;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if coalesce(cardinality(p_profiles), 0) > 100 then
    raise exception 'too_many_profiles' using errcode = '22023';
  end if;
  select array_agg(distinct id) into v_profiles from unnest(array_append(p_profiles, v_viewer)) id where id is not null;
  select count(*) into v_unavailable from unnest(v_profiles) candidate(profile_id) where not (
    private.can_read_personal_repertoire(candidate.profile_id) and private.can_see_profile(candidate.profile_id)
    and exists(select 1 from public.profiles p where p.id = candidate.profile_id and p.moderation_status <> 'banned')
  );
  if v_unavailable > 0 or cardinality(v_profiles) < 2 then
    return jsonb_build_object('songs', '[]'::jsonb, 'unavailable_count', v_unavailable);
  end if;
  with recursive eligible as materialized (
    select r.id, r.profile_id, r.song, r.created_at from public.personal_repertoire r
    where r.profile_id = any(v_profiles) and not r.hidden
  ), edges as materialized (
    select a.id a, b.id b from eligible a join eligible b
      on a.id <> b.id and private.personal_songs_match(a.song, b.song)
  ), reach(root,id) as (
    select id,id from eligible union
    select reach.root,edges.b from reach join edges on edges.a = reach.id
  ), identities as (
    select id,min(root::text) identity from reach group by id
  ), common as (
    select i.identity from eligible e join identities i using(id)
    group by i.identity having count(distinct e.profile_id) = cardinality(v_profiles)
  ), mine as (
    select distinct on (i.identity) i.identity, e.song
    from eligible e join identities i using(id) join common c on c.identity = i.identity
    where e.profile_id = v_viewer order by i.identity, e.created_at, e.id
  )
  select coalesce(jsonb_agg(private.personal_song_payload(song) order by song->>'title', identity), '[]'::jsonb)
    into v_songs from mine;
  return jsonb_build_object('songs', v_songs, 'unavailable_count', 0);
end;
$$;
revoke all on function private.group_common_repertoire(uuid[]) from public, anon;
grant execute on function private.group_common_repertoire(uuid[]) to authenticated;
create function public.group_common_repertoire(p_profiles uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.group_common_repertoire(p_profiles)
$$;
revoke all on function public.group_common_repertoire(uuid[]) from public, anon;
grant execute on function public.group_common_repertoire(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
