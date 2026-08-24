-- Dispo 2.4 — UUID canoniques dans les JSON partagés.
-- Swift encode UUID en majuscules, PostgreSQL et Android en minuscules. Une
-- comparaison texte exacte empêchait donc Android de réordonner un morceau
-- iOS et empêchait le RPC solos de retrouver ce même morceau. Toutes les
-- écritures sont désormais normalisées côté base, anciennes données incluses.

create or replace function public.normalize_song_array_uuid_casing(p_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_song jsonb;
  v_solos jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_song_array' using errcode = '22023';
  end if;

  for v_song in
    select s.value
    from jsonb_array_elements(p_items) with ordinality s(value, ordinal)
    order by s.ordinal
  loop
    if jsonb_typeof(v_song) <> 'object' or nullif(v_song ->> 'id', '') is null then
      raise exception 'invalid_song_object' using errcode = '22023';
    end if;

    v_song := jsonb_set(v_song, '{id}', to_jsonb(lower(v_song ->> 'id')), false);

    if jsonb_typeof(v_song -> 'solos') = 'array' then
      select coalesce(
        jsonb_agg(to_jsonb(lower(s.value #>> '{}')) order by s.ordinal),
        '[]'::jsonb
      )
      into v_solos
      from jsonb_array_elements(v_song -> 'solos') with ordinality s(value, ordinal);
      v_song := jsonb_set(v_song, '{solos}', v_solos, false);
    end if;

    v_result := v_result || jsonb_build_array(v_song);
  end loop;

  return v_result;
end;
$$;

revoke all on function public.normalize_song_array_uuid_casing(jsonb) from public, anon, authenticated;

create or replace function public.normalize_group_event_song_uuids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.setlist := public.normalize_song_array_uuid_casing(new.setlist);
  return new;
end;
$$;

revoke all on function public.normalize_group_event_song_uuids() from public, anon, authenticated;

-- Le préfixe 00 garantit que cette normalisation précède les gardes setlist
-- (PostgreSQL exécute les triggers d'un même type par ordre alphabétique).
drop trigger if exists group_events_00_normalize_song_uuids on public.group_events;
create trigger group_events_00_normalize_song_uuids
  before insert or update of setlist on public.group_events
  for each row execute function public.normalize_group_event_song_uuids();

create or replace function public.normalize_group_repertoire_song_uuids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.repertoire := public.normalize_song_array_uuid_casing(new.repertoire);
  return new;
end;
$$;

revoke all on function public.normalize_group_repertoire_song_uuids() from public, anon, authenticated;

drop trigger if exists music_groups_00_normalize_song_uuids on public.music_groups;
create trigger music_groups_00_normalize_song_uuids
  before insert or update of repertoire on public.music_groups
  for each row execute function public.normalize_group_repertoire_song_uuids();

-- Le helper atomique accepte lui aussi les deux casses dans les requêtes des
-- anciennes versions clientes. Les cartes restent stockées en minuscules.
create or replace function public.apply_approved_song_order(
  p_items jsonb,
  p_song_ids text[]
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_id text;
  v_song jsonb;
  v_seen text[] := array[]::text[];
  v_ordered jsonb[] := array[]::jsonb[];
  v_result jsonb := '[]'::jsonb;
  v_index integer := 1;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_song_array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    where jsonb_typeof(s.value) <> 'object'
       or nullif(s.value ->> 'id', '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    group by lower(s.value ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'invalid_or_duplicate_song_id' using errcode = '22023';
  end if;

  for v_id in
    select lower(requested.id)
    from unnest(coalesce(p_song_ids, array[]::text[])) with ordinality requested(id, ordinal)
    order by requested.ordinal
  loop
    if not (v_id = any(v_seen)) then
      select s.value into v_song
      from jsonb_array_elements(p_items) s(value)
      where lower(s.value ->> 'id') = v_id
        and coalesce((s.value ->> 'is_approved')::boolean, true)
      limit 1;

      if found then
        v_seen := array_append(v_seen, v_id);
        v_ordered := array_append(v_ordered, v_song);
      end if;
    end if;
  end loop;

  for v_song in
    select s.value
    from jsonb_array_elements(p_items) with ordinality s(value, ordinal)
    where coalesce((s.value ->> 'is_approved')::boolean, true)
    order by s.ordinal
  loop
    v_id := lower(v_song ->> 'id');
    if not (v_id = any(v_seen)) then
      v_seen := array_append(v_seen, v_id);
      v_ordered := array_append(v_ordered, v_song);
    end if;
  end loop;

  for v_song in
    select s.value
    from jsonb_array_elements(p_items) with ordinality s(value, ordinal)
    order by s.ordinal
  loop
    if coalesce((v_song ->> 'is_approved')::boolean, true) then
      v_result := v_result || jsonb_build_array(v_ordered[v_index]);
      v_index := v_index + 1;
    else
      v_result := v_result || jsonb_build_array(v_song);
    end if;
  end loop;

  return public.normalize_song_array_uuid_casing(v_result);
end;
$$;

revoke all on function public.apply_approved_song_order(jsonb, text[]) from public, anon, authenticated;

-- Canonicalisation des 24 objets existants (aucun identifiant ne change de
-- valeur : seule la casse textuelle du JSON est harmonisée).
update public.music_groups g
set repertoire = public.normalize_song_array_uuid_casing(g.repertoire)
where g.repertoire is distinct from public.normalize_song_array_uuid_casing(g.repertoire);

update public.group_events e
set setlist = public.normalize_song_array_uuid_casing(e.setlist)
where e.setlist is distinct from public.normalize_song_array_uuid_casing(e.setlist);
