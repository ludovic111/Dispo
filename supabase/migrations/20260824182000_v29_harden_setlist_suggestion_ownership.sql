-- Dispo 2.3 — identité stable et ordre protégé pour les suggestions de setlist.
--
-- Les clients historiques iOS stockaient le nom dans `suggested_by`, tandis
-- qu'Android stocke l'UUID. Le nom reste accepté pour compatibilité seulement
-- lorsqu'il identifie un unique membre du groupe. Les nouveaux clients
-- utilisent tous l'UUID lowercase. Un membre ne peut par ailleurs plus
-- permuter des suggestions déjà présentes autour des morceaux validés.

create or replace function public.guard_group_event_setlist()
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
  if new.setlist is not distinct from old.setlist or v_uid is null then
    return new;
  end if;

  if exists (
    select 1
    from public.music_groups g
    where g.id = old.group_id and g.leader_id = v_uid
  ) then
    return new;
  end if;

  if not public.is_group_member(old.group_id) then
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
        exists (
          select 1 from public.music_groups g
          where g.id = old.group_id and g.leader_id = p.id
        )
        or exists (
          select 1 from public.group_members m
          where m.group_id = old.group_id and m.profile_id = p.id
        )
      );
  end if;

  if v_name is null
     or jsonb_typeof(old.setlist) <> 'array'
     or jsonb_typeof(new.setlist) <> 'array'
  then
    raise exception 'invalid_event_setlist' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.setlist) s(value)
    where jsonb_typeof(s.value) <> 'object'
       or nullif(s.value ->> 'id', '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(new.setlist) s(value)
    group by lower(s.value ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'invalid_or_duplicate_song_id' using errcode = '22023';
  end if;

  for v_old_song in select s.value from jsonb_array_elements(old.setlist) s(value)
  loop
    select s.value into v_new_song
    from jsonb_array_elements(new.setlist) s(value)
    where lower(s.value ->> 'id') = lower(v_old_song ->> 'id')
    limit 1;

    if not found then
      raise exception 'member_cannot_remove_setlist_song' using errcode = '42501';
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
        raise exception 'member_cannot_edit_setlist_song' using errcode = '42501';
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
    from jsonb_array_elements(new.setlist) n(value)
    where not exists (
      select 1
      from jsonb_array_elements(old.setlist) o(value)
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

  -- Toutes les cartes préexistantes, validées ou non, gardent le même ordre.
  -- Une nouvelle suggestion peut s'insérer sans déplacer relativement les
  -- décisions et suggestions déjà partagées par le groupe.
  if (
    select coalesce(jsonb_agg(lower(value ->> 'id') order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(old.setlist) with ordinality s(value, ordinal)
  ) is distinct from (
    select coalesce(jsonb_agg(lower(n.value ->> 'id') order by n.ordinal), '[]'::jsonb)
    from jsonb_array_elements(new.setlist) with ordinality n(value, ordinal)
    where exists (
      select 1
      from jsonb_array_elements(old.setlist) o(value)
      where lower(o.value ->> 'id') = lower(n.value ->> 'id')
    )
  ) then
    raise exception 'only_leader_can_reorder_existing_setlist' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_group_event_setlist() from public, anon, authenticated;
