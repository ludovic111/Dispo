-- Dispo 2.3 — invariants structurels, y compris pour les leaders et anciens clients.
--
-- Les gardes métier laissent volontairement le leader gérer ordre et contenu.
-- La structure JSON reste néanmoins obligatoire pour toute écriture directe :
-- tableau d'objets, ID non vide et unique sans distinction de casse.

create or replace function public.validate_group_event_setlist_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(new.setlist) <> 'array' then
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

  return new;
end;
$$;

revoke all on function public.validate_group_event_setlist_structure()
  from public, anon, authenticated;

drop trigger if exists group_events_01_validate_song_array on public.group_events;
create trigger group_events_01_validate_song_array
  before insert or update of setlist on public.group_events
  for each row execute function public.validate_group_event_setlist_structure();

create or replace function public.validate_group_repertoire_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(new.repertoire) <> 'array' then
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

  return new;
end;
$$;

revoke all on function public.validate_group_repertoire_structure()
  from public, anon, authenticated;

drop trigger if exists music_groups_01_validate_song_array on public.music_groups;
create trigger music_groups_01_validate_song_array
  before insert or update of repertoire on public.music_groups
  for each row execute function public.validate_group_repertoire_structure();
