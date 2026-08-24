-- Dispo 2.3 — vraie fusion à trois voies des morceaux partagés.
--
-- Le snapshot complet d'origine permet de distinguer une modification locale
-- d'un champ inchangé. Le serveur garde donc l'ordre courant, les changements
-- distants (solos, approbation, métadonnées), les ajouts inconnus et les
-- suppressions distantes. Seules les clés réellement modifiées localement sont
-- appliquées ; les ajouts locaux neufs sont placés à la fin. Le tri reste du
-- ressort des RPC `reorder_*` dédiées.

drop function if exists public.merge_group_repertoire_snapshot(uuid, text[], jsonb);
drop function if exists public.merge_event_setlist_snapshot(uuid, text[], jsonb);
drop function if exists public.merge_song_array_snapshot(jsonb, text[], jsonb);

create or replace function public.merge_song_array_snapshot(
  p_current jsonb,
  p_original_songs jsonb,
  p_desired_songs jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_current jsonb := public.normalize_song_array_uuid_casing(p_current);
  v_original jsonb := public.normalize_song_array_uuid_casing(p_original_songs);
  v_desired jsonb := public.normalize_song_array_uuid_casing(p_desired_songs);
  v_current_song jsonb;
  v_original_song jsonb;
  v_desired_song jsonb;
  v_merged_song jsonb;
  v_id text;
  v_key text;
  v_was_original boolean;
  v_has_desired boolean;
  v_emitted_ids text[] := array[]::text[];
  v_result jsonb := '[]'::jsonb;
begin
  if exists (
    select 1 from jsonb_array_elements(v_current) s(value)
    group by lower(s.value ->> 'id') having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_original) s(value)
    group by lower(s.value ->> 'id') having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_desired) s(value)
    group by lower(s.value ->> 'id') having count(*) > 1
  ) then
    raise exception 'duplicate_song_id_in_snapshot' using errcode = '22023';
  end if;

  for v_current_song in
    select s.value
    from jsonb_array_elements(v_current) with ordinality s(value, ordinal)
    order by s.ordinal
  loop
    v_id := lower(v_current_song ->> 'id');

    select s.value into v_original_song
    from jsonb_array_elements(v_original) s(value)
    where lower(s.value ->> 'id') = v_id
    limit 1;
    v_was_original := found;

    select s.value into v_desired_song
    from jsonb_array_elements(v_desired) s(value)
    where lower(s.value ->> 'id') = v_id
    limit 1;
    v_has_desired := found;

    if v_was_original then
      if not v_has_desired then
        -- Présent à l'ouverture mais retiré du résultat local : suppression
        -- explicite. Les IDs déjà supprimés à distance n'entrent jamais ici.
        continue;
      end if;

      v_merged_song := v_current_song;
      for v_key in
        select keys.key
        from (
          select jsonb_object_keys(v_original_song) as key
          union
          select jsonb_object_keys(v_desired_song) as key
        ) keys
        where keys.key <> 'id'
      loop
        if (v_original_song -> v_key) is distinct from (v_desired_song -> v_key) then
          if v_desired_song ? v_key then
            v_merged_song := jsonb_set(
              v_merged_song,
              array[v_key],
              v_desired_song -> v_key,
              true
            );
          else
            v_merged_song := v_merged_song - v_key;
          end if;
        end if;
      end loop;
      v_result := v_result || jsonb_build_array(v_merged_song);
    else
      -- Ajout distant inconnu du snapshot : sa valeur serveur et sa position
      -- gagnent. Une collision UUID avec un ajout local ne le remplace pas.
      v_result := v_result || jsonb_build_array(v_current_song);
    end if;

    if not (v_id = any(v_emitted_ids)) then
      v_emitted_ids := array_append(v_emitted_ids, v_id);
    end if;
  end loop;

  -- Seuls les IDs réellement nouveaux localement sont ajoutés. Un ID présent
  -- dans original mais absent de current a été supprimé à distance : il ne
  -- doit pas ressusciter.
  for v_desired_song in
    select s.value
    from jsonb_array_elements(v_desired) with ordinality s(value, ordinal)
    order by s.ordinal
  loop
    v_id := lower(v_desired_song ->> 'id');
    if not (v_id = any(v_emitted_ids))
       and not exists (
         select 1
         from jsonb_array_elements(v_original) o(value)
         where lower(o.value ->> 'id') = v_id
       )
    then
      v_result := v_result || jsonb_build_array(v_desired_song);
      v_emitted_ids := array_append(v_emitted_ids, v_id);
    end if;
  end loop;

  return public.normalize_song_array_uuid_casing(v_result);
end;
$$;

revoke all on function public.merge_song_array_snapshot(jsonb, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.merge_group_repertoire_snapshot(
  p_group_id uuid,
  p_original_songs jsonb,
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
    p_original_songs,
    p_desired_songs
  );

  update public.music_groups
  set repertoire = v_merged
  where id = p_group_id
  returning repertoire into v_merged;

  return v_merged;
end;
$$;

revoke all on function public.merge_group_repertoire_snapshot(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.merge_group_repertoire_snapshot(uuid, jsonb, jsonb)
  to authenticated;

create or replace function public.merge_event_setlist_snapshot(
  p_event_id uuid,
  p_original_songs jsonb,
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
    p_original_songs,
    p_desired_songs
  );

  update public.group_events
  set setlist = v_merged
  where id = p_event_id
  returning setlist into v_merged;

  return v_merged;
end;
$$;

revoke all on function public.merge_event_setlist_snapshot(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.merge_event_setlist_snapshot(uuid, jsonb, jsonb)
  to authenticated;
