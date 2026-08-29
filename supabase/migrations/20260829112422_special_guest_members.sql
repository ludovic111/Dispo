-- Dispo 2.4 (33) — Special guests manuels et explicitement temporaires.
--
-- `occasional` était ambigu dans l'interface et restait techniquement un
-- membre de groupe ordinaire. Le statut canonique devient `guest`, affiché
-- 🌠 Special guest sur toutes les plateformes. Les lignes historiques sont
-- converties sans changer leurs droits ni supprimer leur contenu.

alter table public.group_members
  drop constraint if exists group_members_kind_check;
alter table public.group_invitations
  drop constraint if exists group_invitations_kind_check;

update public.group_members
set kind = 'guest'
where kind = 'occasional';

update public.group_invitations
set kind = 'guest'
where kind = 'occasional';

alter table public.group_members
  add constraint group_members_kind_check
  check (kind in ('permanent', 'guest'));
alter table public.group_invitations
  add constraint group_invitations_kind_check
  check (kind in ('permanent', 'guest'));

-- Un invité temporaire ne peut jamais devenir leader par un appel RPC direct.
-- Le leader doit d'abord le passer explicitement en membre permanent.
create or replace function public.transfer_group_leadership(
  p_group_id uuid,
  p_new_leader_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_current_leader uuid;
  v_target_premium boolean;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 37002));

  select g.leader_id into v_current_leader
  from public.music_groups g
  where g.id = p_group_id
  for update;

  if not found then
    raise exception 'group_not_found' using errcode = '22023';
  end if;
  if v_current_leader <> v_user then
    raise exception 'only_current_leader_can_transfer' using errcode = '42501';
  end if;
  if p_new_leader_id = v_current_leader then
    return;
  end if;
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id
      and m.profile_id = p_new_leader_id
      and m.kind = 'permanent'
  ) then
    raise exception 'new_leader_must_be_permanent_member' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_new_leader_id::text, 37001));

  select coalesce(p.is_premium, false) into v_target_premium
  from public.profiles p
  where p.id = p_new_leader_id;

  if not coalesce(v_target_premium, false) and exists (
    select 1
    from public.music_groups g
    where g.leader_id = p_new_leader_id
      and g.id <> p_group_id
  ) then
    raise exception 'premium_required_for_additional_group' using errcode = '42501';
  end if;

  update public.music_groups
  set leader_id = p_new_leader_id
  where id = p_group_id;
end;
$$;

revoke all on function public.transfer_group_leadership(uuid, uuid)
  from public, anon;
grant execute on function public.transfer_group_leadership(uuid, uuid)
  to authenticated;
