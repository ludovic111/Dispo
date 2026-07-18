-- Dispo — groupes, noyau fixe (permanent/occasionnel) et présence aux événements.
-- Phase 2b : synchronisation serveur des groupes jusqu'ici locaux.

-- ===========================================================================
-- Tables d'abord (les helpers RLS les référencent)
-- ===========================================================================

create table public.music_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  emoji text not null default '🎶',
  leader_id uuid not null references public.profiles (id) on delete cascade,
  repertoire jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index music_groups_leader_idx on public.music_groups (leader_id);

create table public.group_members (
  group_id uuid not null references public.music_groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'permanent'
    check (kind in ('permanent', 'occasional')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create index group_members_profile_idx on public.group_members (profile_id);

create table public.group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.music_groups (id) on delete cascade,
  kind text not null check (kind in ('Concert', 'Répétition', 'Jam')),
  title text not null check (length(title) between 1 and 120),
  venue text not null default '',
  date timestamptz not null,
  setlist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index group_events_group_date_idx on public.group_events (group_id, date);

create table public.event_attendance (
  event_id uuid not null references public.group_events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('available', 'unavailable', 'pending')),
  responded_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create index event_attendance_profile_idx on public.event_attendance (profile_id);

-- ===========================================================================
-- Helpers RLS
-- ===========================================================================

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and profile_id = auth.uid()
  )
  or exists (
    select 1 from public.music_groups
    where id = p_group_id and leader_id = auth.uid()
  );
$$;

create or replace function public.is_group_leader(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.music_groups
    where id = p_group_id and leader_id = auth.uid()
  );
$$;

revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.is_group_leader(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_leader(uuid) to authenticated;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.music_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_events enable row level security;
alter table public.event_attendance enable row level security;

create policy "music_groups_select_member"
  on public.music_groups for select to authenticated
  using (public.is_group_member(id));

create policy "music_groups_insert_premium"
  on public.music_groups for insert to authenticated
  with check (
    leader_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_premium = true
    )
  );

create policy "music_groups_update_leader"
  on public.music_groups for update to authenticated
  using (public.is_group_leader(id))
  with check (public.is_group_leader(id));

create policy "music_groups_delete_leader"
  on public.music_groups for delete to authenticated
  using (public.is_group_leader(id));

create trigger music_groups_touch before update on public.music_groups
  for each row execute function public.touch_updated_at();

create policy "group_members_select_member"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_members_insert_leader_or_self"
  on public.group_members for insert to authenticated
  with check (
    public.is_group_leader(group_id)
    or profile_id = auth.uid()
  );

create policy "group_members_update_leader"
  on public.group_members for update to authenticated
  using (public.is_group_leader(group_id))
  with check (public.is_group_leader(group_id));

create policy "group_members_delete_leader_or_self"
  on public.group_members for delete to authenticated
  using (
    public.is_group_leader(group_id)
    or profile_id = auth.uid()
  );

create or replace function public.add_leader_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, profile_id, kind)
  values (new.id, new.leader_id, 'permanent')
  on conflict do nothing;
  return new;
end;
$$;

create trigger music_groups_add_leader
  after insert on public.music_groups
  for each row execute function public.add_leader_as_member();

revoke execute on function public.add_leader_as_member() from public, anon, authenticated;

create policy "group_events_select_member"
  on public.group_events for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_events_insert_leader"
  on public.group_events for insert to authenticated
  with check (public.is_group_leader(group_id));

create policy "group_events_update_member"
  on public.group_events for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy "group_events_delete_leader"
  on public.group_events for delete to authenticated
  using (public.is_group_leader(group_id));

create policy "event_attendance_select_member"
  on public.event_attendance for select to authenticated
  using (
    exists (
      select 1 from public.group_events e
      where e.id = event_id and public.is_group_member(e.group_id)
    )
  );

create policy "event_attendance_insert_self_or_leader"
  on public.event_attendance for insert to authenticated
  with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.group_events e
      where e.id = event_id and public.is_group_leader(e.group_id)
    )
  );

create policy "event_attendance_update_self_or_leader"
  on public.event_attendance for update to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.group_events e
      where e.id = event_id and public.is_group_leader(e.group_id)
    )
  )
  with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.group_events e
      where e.id = event_id and public.is_group_leader(e.group_id)
    )
  );

create policy "event_attendance_delete_self_or_leader"
  on public.event_attendance for delete to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.group_events e
      where e.id = event_id and public.is_group_leader(e.group_id)
    )
  );

create or replace function public.mark_leader_available_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leader uuid;
begin
  select leader_id into v_leader from public.music_groups where id = new.group_id;
  if v_leader is not null then
    insert into public.event_attendance (event_id, profile_id, status)
    values (new.id, v_leader, 'available')
    on conflict (event_id, profile_id) do update
      set status = 'available', responded_at = now();
  end if;
  return new;
end;
$$;

create trigger group_events_mark_leader
  after insert on public.group_events
  for each row execute function public.mark_leader_available_on_event();

revoke execute on function public.mark_leader_available_on_event() from public, anon, authenticated;
