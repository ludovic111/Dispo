-- Empêche les anciennes versions iOS de publier le profil de démonstration
-- « Ludovic » sous l'UUID Auth d'un nouvel utilisateur. Le client corrigé
-- n'envoie plus de cache local pendant la connexion ; ce trigger protège les
-- builds déjà distribués.

create or replace function public.reject_leaked_demo_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if lower(btrim(new.name)) = 'ludovic'
     and new.bio = 'Pianiste latin jazz à Genève. Toujours partant pour une descarga !'
     and new.instruments = array['Piano']::text[]
     and new.genres @> array['Latin / World', 'Jazz']::text[]
     and cardinality(new.genres) = 2 then
    raise exception 'demo_profile_template_not_allowed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_leaked_demo_profile()
  from public, anon, authenticated;

drop trigger if exists profiles_01_reject_leaked_demo_profile on public.profiles;
create trigger profiles_01_reject_leaked_demo_profile
  before insert or update on public.profiles
  for each row execute function public.reject_leaked_demo_profile();

-- Cette phrase venait du profil local de démonstration, jamais d'une saisie
-- volontaire. Tous les comptes qui l'ont héritée repartent donc avec une bio
-- vide ; aucune autre bio utilisateur n'est modifiée.
update public.profiles
set bio = ''
where bio = 'Pianiste latin jazz à Genève. Toujours partant pour une descarga !';

-- Un brouillon vide reste lisible par son propriétaire pour reprendre
-- l'onboarding, mais n'apparaît jamais dans le réseau des autres comptes.
drop policy if exists profiles_select_all_authenticated on public.profiles;
create policy profiles_select_ready_or_own
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or (
      length(btrim(name)) >= 2
      and cardinality(instruments) > 0
    )
  );
