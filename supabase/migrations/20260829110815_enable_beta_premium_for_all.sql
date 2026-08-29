-- Dispo 2.4 / build 33 — la beta ouvre Premium a tous les comptes.
--
-- Cette regle vit aussi cote serveur : les limites de groupes, medias et
-- Auto-SOS ne doivent pas contredire l'interface iOS pendant la beta. Une
-- future sortie de beta devra supprimer le trigger, remettre le default a
-- false et resynchroniser is_premium depuis private.revenuecat_premium_state.

alter table public.profiles
  alter column is_premium set default true;

update public.profiles
set is_premium = true
where not is_premium;

create or replace function private.enforce_beta_premium()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.is_premium := true;
  return new;
end;
$$;

revoke all on function private.enforce_beta_premium()
from public, anon, authenticated;

drop trigger if exists profiles_00_enforce_beta_premium on public.profiles;
create trigger profiles_00_enforce_beta_premium
before insert or update of is_premium on public.profiles
for each row execute function private.enforce_beta_premium();
