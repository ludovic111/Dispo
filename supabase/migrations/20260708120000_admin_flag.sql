-- Rôle admin sur les profils. Seul le serveur (service_role) peut
-- l'accorder : un trigger neutralise toute tentative de s'auto-promouvoir
-- via l'API publique.

alter table public.profiles add column is_admin boolean not null default false;

create function public.protect_admin_flag()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_admin
  before update on public.profiles
  for each row execute function public.protect_admin_flag();
