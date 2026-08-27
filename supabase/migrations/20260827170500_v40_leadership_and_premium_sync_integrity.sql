-- Dispo 2.4 / v40 — ownership de groupe non contournable et convergence
-- monotone du miroir Premium RevenueCat.

-- La policy historique d'UPDATE verifie l'ancien leader via une sous-requete
-- SECURITY DEFINER. Dans le snapshot de la commande, un PATCH direct de
-- leader_id pouvait donc passer son WITH CHECK et contourner la RPC atomique,
-- la contrainte d'appartenance et la limite Premium du destinataire.
create or replace function private.guard_music_group_leader_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.leader_id is not distinct from old.leader_id then
    return new;
  end if;

  -- transfer_group_leadership est SECURITY DEFINER et s'execute sous son
  -- proprietaire de confiance. Les clients PostgREST restent sous
  -- authenticated et ne peuvent donc jamais changer leader_id directement.
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'direct_leadership_update_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_music_group_leader_update()
  from public, anon, authenticated;

drop trigger if exists music_groups_03_guard_leader_update
  on public.music_groups;
create trigger music_groups_03_guard_leader_update
before update of leader_id on public.music_groups
for each row execute function private.guard_music_group_leader_update();

-- Une date de verification canonique independante de profiles.updated_at est
-- necessaire : une edition de profil n'est pas un evenement RevenueCat, et une
-- revocation ancienne ne doit jamais ecraser un octroi canonique plus recent.
create table private.revenuecat_premium_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  is_premium boolean not null,
  checked_at timestamptz not null,
  applied_at timestamptz not null default now()
);

alter table private.revenuecat_premium_state enable row level security;
revoke all on table private.revenuecat_premium_state
  from public, anon, authenticated;

-- Retourne true si l'etat a ete applique, false si une verification canonique
-- plus recente (ou identique) etait deja enregistree. Octrois ET revocations
-- passent obligatoirement par la meme barriere temporelle atomique.
create or replace function public.apply_revenuecat_premium_state(
  p_profile_id uuid,
  p_is_premium boolean,
  p_checked_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_applied_profile uuid;
begin
  if p_profile_id is null or p_is_premium is null or p_checked_at is null then
    raise exception 'invalid_revenuecat_premium_state' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_profile_id
  ) then
    raise exception 'revenuecat_profile_not_found' using errcode = '22023';
  end if;

  insert into private.revenuecat_premium_state(
    profile_id, is_premium, checked_at, applied_at
  ) values (
    p_profile_id, p_is_premium, p_checked_at, now()
  )
  on conflict (profile_id) do update
    set is_premium = excluded.is_premium,
        checked_at = excluded.checked_at,
        applied_at = now()
    where excluded.checked_at
          > private.revenuecat_premium_state.checked_at
  returning profile_id into v_applied_profile;

  if v_applied_profile is null then
    return false;
  end if;

  update public.profiles
  set is_premium = p_is_premium
  where id = p_profile_id;
  return true;
end;
$$;

revoke all on function public.apply_revenuecat_premium_state(
  uuid, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_revenuecat_premium_state(
  uuid, boolean, timestamptz
) to service_role;
