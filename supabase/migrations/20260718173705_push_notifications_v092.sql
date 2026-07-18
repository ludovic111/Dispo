-- Dispo 0.9.2 — enregistrement APNs et file de notifications.
-- Les clients gèrent uniquement leurs appareils. Les notifications sont
-- créées par des triggers SECURITY DEFINER puis livrées par l'Edge Function.

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (length(token) between 32 and 256),
  platform text not null default 'ios' check (platform = 'ios'),
  environment text not null check (environment in ('development', 'production')),
  app_version text not null default '',
  locale text not null default 'system',
  notifications_enabled boolean not null default true,
  sos_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  groups_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;
grant select, insert, update, delete on public.push_devices to authenticated;

create policy "push_devices_select_own"
  on public.push_devices for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "push_devices_insert_own"
  on public.push_devices for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "push_devices_update_own"
  on public.push_devices for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "push_devices_delete_own"
  on public.push_devices for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.push_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  category text not null check (category in ('sos', 'messages', 'groups')),
  title text not null check (length(title) between 1 and 160),
  body text not null check (length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  source_table text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text,
  attempts integer not null default 0 check (attempts between 0 and 10),
  unique (user_id, category, source_table, source_id)
);

create index push_notifications_pending_idx
  on public.push_notifications (actor_id, created_at)
  where sent_at is null and attempts < 3;
alter table public.push_notifications enable row level security;
grant select on public.push_notifications to authenticated;

create policy "push_notifications_select_own"
  on public.push_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.queue_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  sender_name text;
begin
  select
    case when c.participant_a = new.sender_id then c.participant_b else c.participant_a end
  into recipient
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient is null or exists (
    select 1 from public.blocks b
    where (b.blocker_id = recipient and b.blocked_id = new.sender_id)
       or (b.blocker_id = new.sender_id and b.blocked_id = recipient)
  ) then
    return new;
  end if;

  select coalesce(nullif(p.name, ''), 'Un musicien') into sender_name
  from public.profiles p where p.id = new.sender_id;

  if exists (
    select 1 from public.push_devices d
    where d.user_id = recipient and d.notifications_enabled and d.messages_enabled
  ) then
    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    values (
      recipient, new.sender_id, 'messages', sender_name,
      left(new.text, 180),
      jsonb_build_object(
        'category', 'messages', 'target_tab', 'messages',
        'conversation_id', new.conversation_id::text
      ),
      'messages', new.id
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger messages_queue_push
  after insert on public.messages
  for each row execute function public.queue_message_push();

create or replace function public.queue_gig_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    p.id,
    new.host_id,
    'sos',
    'Nouveau SOS compatible',
    left(new.title || case when new.place <> '' then ' · ' || new.place else '' end, 180),
    jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
    'gig_requests',
    new.id
  from public.profiles p
  where p.id <> new.host_id
    and p.availability <> 'Indisponible'
    and p.instruments && new.wanted_instruments
    and exists (
      select 1 from public.push_devices d
      where d.user_id = p.id and d.notifications_enabled and d.sos_enabled
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p.id and b.blocked_id = new.host_id)
         or (b.blocker_id = new.host_id and b.blocked_id = p.id)
    )
  on conflict do nothing;
  return new;
end;
$$;

create trigger gig_requests_queue_push
  after insert on public.gig_requests
  for each row execute function public.queue_gig_push();

create or replace function public.queue_application_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  host uuid;
  applicant_name text;
begin
  select g.host_id into host from public.gig_requests g where g.id = new.gig_id;
  select coalesce(nullif(p.name, ''), 'Un musicien') into applicant_name
  from public.profiles p where p.id = new.musician_id;

  if host is not null and exists (
    select 1 from public.push_devices d
    where d.user_id = host and d.notifications_enabled and d.messages_enabled
  ) then
    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    values (
      host, new.musician_id, 'messages', 'Nouvelle candidature',
      left(applicant_name || ' peut te dépanner.', 180),
      jsonb_build_object('category', 'messages', 'target_tab', 'sos', 'gig_id', new.gig_id::text),
      'gig_applications', new.id
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger gig_applications_queue_push
  after insert on public.gig_applications
  for each row execute function public.queue_application_push();

create or replace function public.queue_group_event_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_leader uuid;
begin
  select g.leader_id into event_leader
  from public.music_groups g where g.id = new.group_id;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    m.profile_id,
    event_leader,
    'groups',
    'Nouvel événement de groupe',
    left(new.title || case when new.venue <> '' then ' · ' || new.venue else '' end, 180),
    jsonb_build_object('category', 'groups', 'target_tab', 'messages', 'group_id', new.group_id::text),
    'group_events',
    new.id
  from public.group_members m
  where m.group_id = new.group_id
    and m.profile_id <> event_leader
    and exists (
      select 1 from public.push_devices d
      where d.user_id = m.profile_id and d.notifications_enabled and d.groups_enabled
    )
  on conflict do nothing;
  return new;
end;
$$;

create trigger group_events_queue_push
  after insert on public.group_events
  for each row execute function public.queue_group_event_push();

revoke all on function public.queue_message_push() from public, anon, authenticated;
revoke all on function public.queue_gig_push() from public, anon, authenticated;
revoke all on function public.queue_application_push() from public, anon, authenticated;
revoke all on function public.queue_group_event_push() from public, anon, authenticated;
