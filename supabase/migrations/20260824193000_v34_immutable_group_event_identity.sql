-- Dispo 2.3 — l'identité d'une session est immuable.
--
-- L'UUID alimente présence, SOS liés, déduplication et deep links. Une session
-- modifiée garde donc toujours sa clé ; un changement d'identité passe par une
-- nouvelle ligne explicite, jamais par un PATCH de la clé primaire.

create or replace function public.guard_group_event_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'event_id_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_group_event_identity()
  from public, anon, authenticated;

drop trigger if exists group_events_02_guard_identity on public.group_events;
create trigger group_events_02_guard_identity
  before update on public.group_events
  for each row execute function public.guard_group_event_identity();
