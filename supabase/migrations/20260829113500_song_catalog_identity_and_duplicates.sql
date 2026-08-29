-- Dispo 2.4 (33) — identités catalogue et zéro doublon par collection.
--
-- Les morceaux restent dans les JSONB partagés iOS/Android. Chaque carte a
-- son UUID (`id`) et peut désormais porter l'identité stable de
-- l'enregistrement (`catalog_id`). Le serveur refuse deux fois le même
-- catalogue ou le même couple titre/artiste dans un répertoire/setlist.

-- Une seule collection historique contient un doublon textuel. La procédure
-- est générique : elle garde la carte la plus riche (tonalité, catalogue,
-- pochette), rattache ses documents/commentaires et retire les autres.
create temporary table dispo_duplicate_repertoire_songs (
  group_id uuid not null,
  duplicate_id uuid not null,
  keeper_id uuid not null,
  primary key (group_id, duplicate_id)
) on commit drop;

insert into dispo_duplicate_repertoire_songs (group_id, duplicate_id, keeper_id)
with expanded as (
  select
    g.id as group_id,
    (s.value ->> 'id')::uuid as song_id,
    lower(regexp_replace(trim(coalesce(s.value ->> 'title', '')), '\s+', ' ', 'g'))
      || '|'
      || lower(regexp_replace(trim(coalesce(s.value ->> 'artist', '')), '\s+', ' ', 'g')) as identity,
    row_number() over (
      partition by g.id,
        lower(regexp_replace(trim(coalesce(s.value ->> 'title', '')), '\s+', ' ', 'g')),
        lower(regexp_replace(trim(coalesce(s.value ->> 'artist', '')), '\s+', ' ', 'g'))
      order by
        (nullif(s.value ->> 'key', '') is not null)::int desc,
        (nullif(s.value ->> 'catalog_id', '') is not null)::int desc,
        (nullif(s.value ->> 'artwork_url', '') is not null)::int desc,
        s.ordinality
    ) as duplicate_rank,
    first_value((s.value ->> 'id')::uuid) over (
      partition by g.id,
        lower(regexp_replace(trim(coalesce(s.value ->> 'title', '')), '\s+', ' ', 'g')),
        lower(regexp_replace(trim(coalesce(s.value ->> 'artist', '')), '\s+', ' ', 'g'))
      order by
        (nullif(s.value ->> 'key', '') is not null)::int desc,
        (nullif(s.value ->> 'catalog_id', '') is not null)::int desc,
        (nullif(s.value ->> 'artwork_url', '') is not null)::int desc,
        s.ordinality
    ) as keeper_id
  from public.music_groups g
  cross join lateral jsonb_array_elements(coalesce(g.repertoire, '[]'::jsonb))
    with ordinality s(value, ordinality)
  where nullif(s.value ->> 'id', '') is not null
    and nullif(trim(s.value ->> 'title'), '') is not null
)
select group_id, song_id, keeper_id
from expanded
where duplicate_rank > 1;

update public.group_docs d
set song_id = m.keeper_id
from dispo_duplicate_repertoire_songs m
where d.group_id = m.group_id and d.song_id = m.duplicate_id;

update public.song_comments c
set song_id = m.keeper_id
from dispo_duplicate_repertoire_songs m
where c.group_id = m.group_id and c.song_id = m.duplicate_id;

update public.music_groups g
set repertoire = cleaned.items
from (
  select g2.id,
         coalesce(jsonb_agg(s.value order by s.ordinality)
           filter (where m.duplicate_id is null), '[]'::jsonb) as items
  from public.music_groups g2
  cross join lateral jsonb_array_elements(coalesce(g2.repertoire, '[]'::jsonb))
    with ordinality s(value, ordinality)
  left join dispo_duplicate_repertoire_songs m
    on m.group_id = g2.id and m.duplicate_id::text = s.value ->> 'id'
  group by g2.id
) cleaned
where g.id = cleaned.id
  and exists (
    select 1 from dispo_duplicate_repertoire_songs m where m.group_id = g.id
  );

create or replace function private.assert_unique_song_cards(p_items jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_song_array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    where nullif(s.value ->> 'id', '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    group by s.value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'invalid_or_duplicate_song_id' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    where nullif(trim(s.value ->> 'catalog_id'), '') is not null
    group by lower(trim(s.value ->> 'catalog_id'))
    having count(*) > 1
  ) then
    raise exception 'duplicate_song_catalog_id' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    where nullif(trim(s.value ->> 'title'), '') is not null
    group by
      lower(regexp_replace(trim(coalesce(s.value ->> 'title', '')), '\s+', ' ', 'g')),
      lower(regexp_replace(trim(coalesce(s.value ->> 'artist', '')), '\s+', ' ', 'g'))
    having count(*) > 1
  ) then
    raise exception 'duplicate_song_identity' using errcode = '23505';
  end if;
end;
$$;

revoke all on function private.assert_unique_song_cards(jsonb)
  from public, anon, authenticated;

create or replace function private.guard_unique_group_repertoire()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_unique_song_cards(new.repertoire);
  return new;
end;
$$;

create or replace function private.guard_unique_event_setlist()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_unique_song_cards(new.setlist);
  return new;
end;
$$;

revoke all on function private.guard_unique_group_repertoire()
  from public, anon, authenticated;
revoke all on function private.guard_unique_event_setlist()
  from public, anon, authenticated;

drop trigger if exists music_groups_00_unique_song_cards on public.music_groups;
create trigger music_groups_00_unique_song_cards
before insert or update of repertoire on public.music_groups
for each row execute function private.guard_unique_group_repertoire();

drop trigger if exists group_events_00_unique_song_cards on public.group_events;
create trigger group_events_00_unique_song_cards
before insert or update of setlist on public.group_events
for each row execute function private.guard_unique_event_setlist();
