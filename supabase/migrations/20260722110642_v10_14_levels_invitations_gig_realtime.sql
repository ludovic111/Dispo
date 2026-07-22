-- 1.0 (14) : niveau par instrument, invitations de groupe à accepter,
-- candidatures SOS en realtime.

-- Niveau par instrument (clé = Instrument.rawValue, valeur = Level.rawValue).
alter table public.profiles
  add column instrument_levels jsonb not null default '{}'::jsonb;

-- Invitations de groupe : l'invité doit accepter avant d'être membre.
create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.music_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'occasional'
    check (kind in ('permanent', 'occasional')),
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);

create index group_invitations_profile_idx on public.group_invitations (profile_id);
create index group_invitations_group_idx on public.group_invitations (group_id);
create index group_invitations_invited_by_idx on public.group_invitations (invited_by);

alter table public.group_invitations enable row level security;

create policy group_invitations_select_involved on public.group_invitations
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_group_member(group_id));

create policy group_invitations_insert_leader on public.group_invitations
  for insert to authenticated
  with check (
    public.is_group_leader(group_id)
    and invited_by = (select auth.uid())
    and profile_id <> (select auth.uid())
  );

create policy group_invitations_delete_involved on public.group_invitations
  for delete to authenticated
  using (profile_id = (select auth.uid()) or public.is_group_leader(group_id));

-- Accepter : l'invité rejoint le groupe. SECURITY DEFINER car l'insertion
-- dans group_members est réservée au leader par la RLS.
create or replace function public.accept_group_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.group_invitations%rowtype;
begin
  select * into inv from public.group_invitations
  where id = invitation_id and profile_id = auth.uid();
  if not found then
    raise exception 'invitation_not_found';
  end if;
  insert into public.group_members (group_id, profile_id, kind)
  values (inv.group_id, inv.profile_id, inv.kind)
  on conflict do nothing;
  delete from public.group_invitations where id = inv.id;
end;
$$;
revoke all on function public.accept_group_invitation(uuid) from public, anon;
grant execute on function public.accept_group_invitation(uuid) to authenticated;

-- Mes invitations, avec les infos du groupe : l'invité ne peut pas lire
-- music_groups tant qu'il n'est pas membre, d'où le SECURITY DEFINER.
create or replace function public.my_group_invitations()
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_emoji text,
  group_photo_url text,
  invited_by_name text,
  kind text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select i.id, i.group_id, g.name, g.emoji, g.photo_url,
         coalesce(nullif(p.name, ''), 'Un musicien'),
         i.kind, i.created_at
  from public.group_invitations i
  join public.music_groups g on g.id = i.group_id
  left join public.profiles p on p.id = i.invited_by
  where i.profile_id = auth.uid()
  order by i.created_at desc;
$$;
revoke all on function public.my_group_invitations() from public, anon;
grant execute on function public.my_group_invitations() to authenticated;

-- Push : notifier l'invité (préférence « groupes », blocages respectés).
create or replace function public.queue_group_invitation_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inviter_name text;
  group_name text;
begin
  select coalesce(nullif(p.name, ''), 'Un musicien') into inviter_name
  from public.profiles p where p.id = new.invited_by;

  select g.name into group_name
  from public.music_groups g where g.id = new.group_id;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    new.profile_id,
    new.invited_by,
    'groups',
    '🎶 Invitation à un groupe',
    left(inviter_name || ' t''invite dans « ' || coalesce(group_name, 'un groupe') || ' »', 180),
    jsonb_build_object(
      'category', 'groups', 'target_tab', 'messages',
      'group_id', new.group_id::text
    ),
    'group_invitations',
    new.id
  where exists (
      select 1 from public.push_devices d
      where d.user_id = new.profile_id and d.notifications_enabled and d.groups_enabled
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = new.profile_id and b.blocked_id = new.invited_by)
         or (b.blocker_id = new.invited_by and b.blocked_id = new.profile_id)
    )
  on conflict do nothing;
  return new;
end;
$$;

create trigger group_invitations_queue_push
  after insert on public.group_invitations
  for each row execute function public.queue_group_invitation_push();

-- Realtime : invitations + candidatures SOS (gig_requests y est déjà).
alter publication supabase_realtime add table public.group_invitations;
alter publication supabase_realtime add table public.gig_applications;
