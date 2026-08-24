-- Dispo 2.3 — suggestions de répertoire réellement utilisables par les membres.
--
-- La policy historique de music_groups est leader-only. Les clients passent
-- donc par la fusion atomique ciblée, et ce garde limite un non-leader à
-- l'ajout ou au rafraîchissement de sa propre suggestion UUID. Toutes les
-- cartes existantes gardent leur ordre ; approbation, suppression et solos
-- restent réservés au leader.

create or replace function public.guard_group_repertoire()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_legacy_name_is_unique boolean := false;
  v_old_song jsonb;
  v_new_song jsonb;
begin
  if new.repertoire is not distinct from old.repertoire or v_uid is null then
    return new;
  end if;

  if jsonb_typeof(old.repertoire) <> 'array'
     or jsonb_typeof(new.repertoire) <> 'array'
  then
    raise exception 'invalid_group_repertoire' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.repertoire) s(value)
    where jsonb_typeof(s.value) <> 'object'
       or nullif(s.value ->> 'id', '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(new.repertoire) s(value)
    group by lower(s.value ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'invalid_or_duplicate_song_id' using errcode = '22023';
  end if;

  if old.leader_id = v_uid then
    return new;
  end if;

  if not public.is_group_member(old.id) then
    raise exception 'group_membership_required' using errcode = '42501';
  end if;

  select p.name into v_name
  from public.profiles p
  where p.id = v_uid;

  if v_name is not null then
    select count(*) = 1
    into v_legacy_name_is_unique
    from public.profiles p
    where p.name = v_name
      and (
        p.id = old.leader_id
        or exists (
          select 1 from public.group_members m
          where m.group_id = old.id and m.profile_id = p.id
        )
      );
  end if;

  if v_name is null then
    raise exception 'invalid_group_repertoire' using errcode = '22023';
  end if;

  for v_old_song in select s.value from jsonb_array_elements(old.repertoire) s(value)
  loop
    select s.value into v_new_song
    from jsonb_array_elements(new.repertoire) s(value)
    where lower(s.value ->> 'id') = lower(v_old_song ->> 'id')
    limit 1;

    if not found then
      raise exception 'member_cannot_remove_repertoire_song' using errcode = '42501';
    end if;

    if coalesce((v_old_song ->> 'is_approved')::boolean, true)
       or not (
         lower(coalesce(v_old_song ->> 'suggested_by', '')) = lower(v_uid::text)
         or (
           v_legacy_name_is_unique
           and coalesce(v_old_song ->> 'suggested_by', '') = v_name
         )
       )
    then
      if v_new_song is distinct from v_old_song then
        raise exception 'member_cannot_edit_repertoire_song' using errcode = '42501';
      end if;
    elsif coalesce((v_new_song ->> 'is_approved')::boolean, true)
       or not (
         lower(coalesce(v_new_song ->> 'suggested_by', '')) = lower(v_uid::text)
         or (
           v_legacy_name_is_unique
           and coalesce(v_new_song ->> 'suggested_by', '') = v_name
         )
       )
       or v_new_song ? 'solos'
    then
      raise exception 'member_cannot_approve_or_assign_solos' using errcode = '42501';
    end if;
  end loop;

  for v_new_song in
    select n.value
    from jsonb_array_elements(new.repertoire) n(value)
    where not exists (
      select 1
      from jsonb_array_elements(old.repertoire) o(value)
      where lower(o.value ->> 'id') = lower(n.value ->> 'id')
    )
  loop
    if coalesce((v_new_song ->> 'is_approved')::boolean, true)
       or not (
         lower(coalesce(v_new_song ->> 'suggested_by', '')) = lower(v_uid::text)
         or (
           v_legacy_name_is_unique
           and coalesce(v_new_song ->> 'suggested_by', '') = v_name
         )
       )
       or v_new_song ? 'solos'
    then
      raise exception 'member_can_only_add_own_suggestion' using errcode = '42501';
    end if;
  end loop;

  if (
    select coalesce(jsonb_agg(lower(value ->> 'id') order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(old.repertoire) with ordinality s(value, ordinal)
  ) is distinct from (
    select coalesce(jsonb_agg(lower(n.value ->> 'id') order by n.ordinal), '[]'::jsonb)
    from jsonb_array_elements(new.repertoire) with ordinality n(value, ordinal)
    where exists (
      select 1
      from jsonb_array_elements(old.repertoire) o(value)
      where lower(o.value ->> 'id') = lower(n.value ->> 'id')
    )
  ) then
    raise exception 'only_leader_can_reorder_existing_repertoire' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_group_repertoire() from public, anon, authenticated;

drop trigger if exists music_groups_guard_repertoire on public.music_groups;
create trigger music_groups_guard_repertoire
  before update of repertoire on public.music_groups
  for each row execute function public.guard_group_repertoire();

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
  if v_uid is null or not public.is_group_member(p_group_id) then
    raise exception 'group_membership_required' using errcode = '42501';
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
