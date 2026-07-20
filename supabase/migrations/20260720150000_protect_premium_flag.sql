-- Premium accordé par le serveur uniquement (webhook RevenueCat via
-- service_role). Comme pour is_admin : un trigger neutralise silencieusement
-- toute tentative de s'auto-attribuer Premium via l'API publique — les
-- anciens builds qui écrivaient encore is_premium ne cassent pas, leur
-- écriture est simplement ignorée.

create function public.protect_premium_flag()
returns trigger
language plpgsql
as $$
begin
  if new.is_premium is distinct from old.is_premium
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    new.is_premium := old.is_premium;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_premium
  before update on public.profiles
  for each row execute function public.protect_premium_flag();
