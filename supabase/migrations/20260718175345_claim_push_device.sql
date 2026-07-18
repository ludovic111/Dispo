-- Un token APNs identifie l'appareil et peut survivre à un changement de
-- compte. Le compte actuellement authentifié le réclame atomiquement afin de
-- ne jamais livrer les alertes du nouvel utilisateur à l'ancien compte.

create or replace function public.claim_push_device_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'push device user mismatch' using errcode = '42501';
  end if;

  delete from public.push_devices
  where token = new.token and user_id <> new.user_id;
  return new;
end;
$$;

create trigger push_devices_claim_token
  before insert on public.push_devices
  for each row execute function public.claim_push_device_token();

revoke all on function public.claim_push_device_token() from public, anon, authenticated;
