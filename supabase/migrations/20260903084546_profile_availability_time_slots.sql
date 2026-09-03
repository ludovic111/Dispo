-- Optional local-time windows attached to the existing available_dates array.
-- Keys are local calendar days (YYYY-MM-DD); values are arrays of
-- {"start":"HH:mm","end":"HH:mm"}. No timezone is stored or inferred.
alter table public.profiles
  add column if not exists availability_time_slots jsonb not null default '{}'::jsonb;

comment on column public.profiles.availability_time_slots is
  'Optional local HH:mm windows keyed by an available_dates YYYY-MM-DD value.';

create or replace function private.guard_profile_availability_time_slots()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(new.availability_time_slots) is distinct from 'object' then
    raise exception 'invalid_availability_time_slots' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(new.availability_time_slots) as day(day_key, slots)
    where day.day_key !~ '^\d{4}-\d{2}-\d{2}$'
       or day.day_key <> all(new.available_dates::text[])
       or jsonb_typeof(day.slots) is distinct from 'array'
  ) or exists (
    select 1
    from jsonb_each(new.availability_time_slots) as day(day_key, slots)
    cross join lateral jsonb_array_elements(day.slots) as slot(value)
    where jsonb_typeof(slot.value) is distinct from 'object'
       or coalesce(slot.value ->> 'start', '') !~ '^(?:[01]\d|2[0-3]):[0-5]\d$'
       or coalesce(slot.value ->> 'end', '') !~ '^(?:[01]\d|2[0-3]):[0-5]\d$'
       or (slot.value ->> 'start') >= (slot.value ->> 'end')
  ) then
    raise exception 'invalid_availability_time_slots' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_profile_availability_time_slots()
  from public, anon, authenticated;

drop trigger if exists profiles_05_guard_availability_time_slots on public.profiles;
create trigger profiles_05_guard_availability_time_slots
before insert or update of available_dates, availability_time_slots on public.profiles
for each row execute function private.guard_profile_availability_time_slots();
