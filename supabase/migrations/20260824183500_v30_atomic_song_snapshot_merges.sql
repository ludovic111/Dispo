-- Dispo 2.3 — fusions atomiques des répertoires et setlists.
--
-- Une écriture JSON complète préparée sur un appareil pouvait supprimer une
-- suggestion arrivée d'un autre appareil entre la lecture et le PATCH. Les
-- clients transmettent désormais les IDs du snapshot qui a servi à construire
-- leur valeur souhaitée. Sous verrou de ligne, le serveur conserve à leur
-- place tous les IDs distants inconnus de ce snapshot.

create or replace function public.merge_song_array_snapshot(
  p_current jsonb,
  p_original_song_ids text[],
  p_desired_songs jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_current jsonb;
  v_desired jsonb;
  v_original_ids text[];
  v_managed_ids text[];
  v_desired_items jsonb[];
  v_song jsonb;
  v_id text;
  v_result jsonb := '[]'::jsonb;
  v_desired_index integer := 1;
begin
  v_current := public.normalize_song_array_uuid_casing(p_current);
  v_desired := public.normalize_song_array_uuid_casing(p_desired_songs);

  if exists (
    select 1
    from jsonb_array_elements(v_desired) s(value)
    group by lower(s.value ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'duplicate_desired_song_id' using errcode = '22023';
  end if;

  select coalesce(array_agg(d.id order by d.first_ordinal), array[]::text[])
  into v_original_ids
  from (
    select lower(requested.id) as id, min(requested.ordinal) as first_ordinal
    from unnest(coalesce(p_original_song_ids, array[]::text[]))
      with ordinality requested(id, ordinal)
    where nullif(requested.id, '') is not null
    group by lower(requested.id)
  ) d;

  v_managed_ids := v_original_ids;
  for v_id in
    select lower(s.value ->> 'id')
    from jsonb_array_elements(v_desired) with ordinality s(value, ordinal)
    order by s.ordinal
  loop
    if not (v_id = any(v_managed_ids)) then
      v_managed_ids := array_append(v_managed_ids, v_id);
    end if;
  end loop;

  select coalesce(array_agg(s.value order by s.ordinal), array[]::jsonb[])
  into v_desired_items
  from jsonb_array_elements(v_desired) with ordinality s(value, ordinal);

  for v_song in
    select s.value
    from jsonb_array_elements(v_current) with ordinality s(value, ordinal)
    order by s.ordinal
  loop
    v_id := lower(v_song ->> 'id');
    if v_id = any(v_managed_ids) then
      if v_desired_index <= cardinality(v_desired_items) then
        v_result := v_result || jsonb_build_array(v_desired_items[v_desired_index]);
        v_desired_index := v_desired_index + 1;
      end if;
    else
      v_result := v_result || jsonb_build_array(v_song);
    end if;
  end loop;

  while v_desired_index <= cardinality(v_desired_items) loop
    v_result := v_result || jsonb_build_array(v_desired_items[v_desired_index]);
    v_desired_index := v_desired_index + 1;
  end loop;

  return public.normalize_song_array_uuid_casing(v_result);
end;
$$;

revoke all on function public.merge_song_array_snapshot(jsonb, text[], jsonb)
  from public, anon, authenticated;

create or replace function public.merge_group_repertoire_snapshot(
  p_group_id uuid,
  p_original_song_ids text[],
  p_desired_songs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current jsonb;
  v_merged jsonb;
begin
  if v_uid is null or not exists (
    select 1
    from public.music_groups g
    where g.id = p_group_id and g.leader_id = v_uid
  ) then
    raise exception 'only_leader_can_edit_repertoire' using errcode = '42501';
  end if;

  select g.repertoire
  into v_current
  from public.music_groups g
  where g.id = p_group_id
  for update;

  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;

  v_merged := public.merge_song_array_snapshot(
    v_current,
    p_original_song_ids,
    p_desired_songs
  );

  update public.music_groups
  set repertoire = v_merged
  where id = p_group_id
  returning repertoire into v_merged;

  return v_merged;
end;
$$;

revoke all on function public.merge_group_repertoire_snapshot(uuid, text[], jsonb)
  from public, anon;
grant execute on function public.merge_group_repertoire_snapshot(uuid, text[], jsonb)
  to authenticated;

create or replace function public.merge_event_setlist_snapshot(
  p_event_id uuid,
  p_original_song_ids text[],
  p_desired_songs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group_id uuid;
  v_current jsonb;
  v_merged jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select e.group_id, e.setlist
  into v_group_id, v_current
  from public.group_events e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  if not public.is_group_member(v_group_id) then
    raise exception 'group_membership_required' using errcode = '42501';
  end if;

  v_merged := public.merge_song_array_snapshot(
    v_current,
    p_original_song_ids,
    p_desired_songs
  );

  update public.group_events
  set setlist = v_merged
  where id = p_event_id
  returning setlist into v_merged;

  return v_merged;
end;
$$;

revoke all on function public.merge_event_setlist_snapshot(uuid, text[], jsonb)
  from public, anon;
grant execute on function public.merge_event_setlist_snapshot(uuid, text[], jsonb)
  to authenticated;
