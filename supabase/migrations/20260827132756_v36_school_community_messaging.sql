-- Dispo 2.4 / v36 — un canal de communaute stable par ecole.
--
-- Le canal n'a pas de leader individuel : toute affiliation active donne
-- l'acces, et quitter/suspendre l'affiliation le retire immediatement.

create table public.school_channels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.music_schools(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index school_channels_school_idx on public.school_channels(school_id);

create trigger school_channels_touch_updated_at
before update on public.school_channels
for each row execute function private.touch_school_updated_at();

create or replace function private.create_school_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_channels(school_id, name)
  values (new.id, coalesce(nullif(new.short_name, ''), new.name))
  on conflict (school_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_school_channel()
  from public, anon, authenticated;

create trigger music_schools_create_channel
after insert on public.music_schools
for each row execute function private.create_school_channel();

-- Les trois seeds v35 existent deja lors de la creation du trigger.
insert into public.school_channels(school_id, name)
select s.id, coalesce(nullif(s.short_name, ''), s.name)
from public.music_schools s
on conflict (school_id) do nothing;

create table public.school_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.school_channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint school_messages_text_or_tombstone_check check (
    (
      deleted_at is not null
      and text = ''
    )
    or (
      deleted_at is null
      and length(btrim(text)) between 1 and 4000
    )
  )
);

create index school_messages_channel_created_idx
  on public.school_messages(channel_id, created_at desc, id);
create index school_messages_sender_created_idx
  on public.school_messages(sender_id, created_at desc);

-- Les signalements de chat ecole conservent la preuve minimale comme les
-- messages prives, sans detourner leur FK `reports.message_id`.
alter table public.reports
  add column if not exists school_message_id uuid
  references public.school_messages(id) on delete set null;
create index if not exists reports_school_message_idx
  on public.reports(school_message_id)
  where school_message_id is not null;

create or replace function public.capture_reported_message_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if new.message_id is not null and new.school_message_id is not null then
    raise exception 'Only one reported message source is allowed'
      using errcode = '22023';
  end if;

  if new.school_message_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'kind', 'school_message',
      'text', sm.text,
      'created_at', sm.created_at,
      'channel_id', sm.channel_id
    ))
    into v_snapshot
    from public.school_messages sm
    join public.school_channels c on c.id = sm.channel_id
    join public.music_school_memberships reporter
      on reporter.school_id = c.school_id
     and reporter.profile_id = new.reporter_id
     and reporter.status = 'active'
    where sm.id = new.school_message_id
      and sm.sender_id = new.reported_id
      and new.reporter_id = (select auth.uid());

    if v_snapshot is null then
      raise exception 'Invalid reported school message' using errcode = '42501';
    end if;
    new.message_snapshot := v_snapshot;
    return new;
  end if;

  if new.message_id is null then
    new.message_snapshot := null;
    return new;
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'text', m.text,
    'attachment_name', m.attachment_name,
    'attachment_type', m.attachment_type,
    'created_at', m.created_at
  ))
  into v_snapshot
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = new.message_id
    and m.sender_id = new.reported_id
    and new.reporter_id = (select auth.uid())
    and (c.participant_a = new.reporter_id or c.participant_b = new.reporter_id);

  if v_snapshot is null then
    raise exception 'Invalid reported message' using errcode = '42501';
  end if;
  new.message_snapshot := v_snapshot;
  return new;
end;
$$;

create or replace function private.can_read_school_message(
  p_channel_id uuid,
  p_sender_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.school_channels c
      join public.music_schools s on s.id = c.school_id and s.is_active
      join public.music_school_memberships m
       on m.school_id = c.school_id
       and m.profile_id = (select auth.uid())
       and m.status = 'active'
      where c.id = p_channel_id
    )
    and (
      p_sender_id = (select auth.uid())
      or not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_sender_id)
           or (b.blocker_id = p_sender_id and b.blocked_id = (select auth.uid()))
      )
    );
$$;

revoke all on function private.can_read_school_message(uuid, uuid)
  from public, anon;
grant execute on function private.can_read_school_message(uuid, uuid)
  to authenticated;

alter table public.school_channels enable row level security;
alter table public.school_messages enable row level security;

create policy school_channels_select_member
on public.school_channels
for select to authenticated
using (private.is_active_school_member(school_id));

create policy school_messages_select_member_unblocked
on public.school_messages
for select to authenticated
using (
  private.can_read_school_message(channel_id, sender_id)
);

-- Defense en profondeur. Les grants retirent l'INSERT direct : l'envoi passe
-- par send_school_message afin d'appliquer aussi la limite de debit.
create policy school_messages_insert_active_member
on public.school_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.school_channels c
    where c.id = channel_id
      and private.is_active_school_member(c.school_id)
  )
);

revoke all on table public.school_channels from public, anon, authenticated;
revoke all on table public.school_messages from public, anon, authenticated;
grant select on table public.school_channels to authenticated;
grant select on table public.school_messages to authenticated;

create or replace function public.send_school_message(
  p_channel_id uuid,
  p_text text
)
returns public.school_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_school uuid;
  v_text text := btrim(coalesce(p_text, ''));
  v_result public.school_messages%rowtype;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if length(v_text) not between 1 and 4000 then
    raise exception 'invalid_school_message' using errcode = '22023';
  end if;

  select c.school_id into v_school
  from public.school_channels c
  join public.music_schools s on s.id = c.school_id and s.is_active
  where c.id = p_channel_id;

  if v_school is null
     or not private.is_active_school_member(v_school)
  then
    raise exception 'school_channel_not_accessible' using errcode = '42501';
  end if;

  -- Simple, borne et atomise par utilisateur/canal. Les messages supprimes
  -- restent comptes : supprimer ne permet pas de contourner la limite.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_channel_id::text, 36001)
  );
  if (
    select count(*)
    from public.school_messages sm
    where sm.channel_id = p_channel_id
      and sm.sender_id = v_user
      and sm.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'school_message_rate_limit_reached' using errcode = '54000';
  end if;

  insert into public.school_messages(channel_id, sender_id, text)
  values (p_channel_id, v_user, v_text)
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.edit_school_message(
  p_message_id uuid,
  p_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if length(v_text) not between 1 and 4000 then
    raise exception 'invalid_school_message' using errcode = '22023';
  end if;

  update public.school_messages sm
  set text = v_text, edited_at = now()
  where sm.id = p_message_id
    and sm.sender_id = v_user
    and sm.deleted_at is null
    and exists (
      select 1
      from public.school_channels c
      where c.id = sm.channel_id
        and private.is_active_school_member(c.school_id)
    );
  if not found then
    raise exception 'school_message_not_editable' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_school_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update public.school_messages sm
  set text = '', deleted_at = now()
  where sm.id = p_message_id
    and sm.sender_id = v_user
    and sm.deleted_at is null
    and exists (
      select 1
      from public.school_channels c
      where c.id = sm.channel_id
        and private.is_active_school_member(c.school_id)
    );
  if not found then
    raise exception 'school_message_not_deletable' using errcode = '42501';
  end if;

  update public.push_notifications
  set body = 'Message supprime'
  where source_table = 'school_messages' and source_id = p_message_id;
end;
$$;

create or replace function public.recent_school_messages(p_limit integer default 60)
returns setof public.school_messages
language sql
stable
security invoker
set search_path = ''
as $$
  select sm.*
  from public.school_messages sm
  join (
    select id, row_number() over (
      partition by channel_id order by created_at desc, id desc
    ) as position
    from public.school_messages
  ) ranked on ranked.id = sm.id
  where ranked.position <= least(greatest(p_limit, 1), 100)
  order by sm.created_at, sm.id;
$$;

create or replace function public.queue_school_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_school_name text;
begin
  select s.id, coalesce(nullif(s.short_name, ''), s.name)
  into v_school, v_school_name
  from public.school_channels c
  join public.music_schools s on s.id = c.school_id
  where c.id = new.channel_id;

  if v_school is null then
    return new;
  end if;

  insert into public.push_notifications (
    user_id, actor_id, category, title, body, data, source_table, source_id
  )
  select
    m.profile_id,
    new.sender_id,
    'groups',
    coalesce(v_school_name, 'Ecole de musique'),
    'Nouveau message dans la communaute',
    jsonb_build_object(
      'category', 'groups',
      'target_tab', 'messages',
      'school_id', v_school::text,
      'school_channel_id', new.channel_id::text
    ),
    'school_messages',
    new.id
  from public.music_school_memberships m
  where m.school_id = v_school
    and m.status = 'active'
    and m.profile_id <> new.sender_id
    and exists (
      select 1 from public.push_devices d
      where d.user_id = m.profile_id
        and d.notifications_enabled
        and d.groups_enabled
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = m.profile_id and b.blocked_id = new.sender_id)
         or (b.blocker_id = new.sender_id and b.blocked_id = m.profile_id)
    )
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.queue_school_message_push()
  from public, anon, authenticated;

create trigger school_messages_queue_push
after insert on public.school_messages
for each row execute function public.queue_school_message_push();

-- v35 reservait channel_id dans le contrat. Il devient maintenant reel sans
-- modifier la signature que les clients decodent.
create or replace function public.my_music_schools()
returns table (
  school_id uuid,
  slug text,
  name text,
  short_name text,
  city text,
  country_code text,
  logo_url text,
  is_verified boolean,
  membership_id uuid,
  role text,
  role_label text,
  visibility text,
  verification_level text,
  is_primary boolean,
  joined_at timestamptz,
  channel_id uuid,
  member_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.slug, s.name, s.short_name, s.city, s.country_code,
         s.logo_url, s.is_verified, m.id, m.role, m.role_label, m.visibility,
         m.verification_level, m.is_primary, m.joined_at, c.id,
         (select count(*) from public.music_school_memberships count_m
          where count_m.school_id = s.id and count_m.status = 'active')
  from public.music_school_memberships m
  join public.music_schools s on s.id = m.school_id
  join public.school_channels c on c.school_id = s.id
  where m.profile_id = (select auth.uid())
    and m.status = 'active'
    and s.is_active
  order by m.is_primary desc, s.name, s.id;
$$;

revoke all on function public.send_school_message(uuid, text) from public, anon;
revoke all on function public.edit_school_message(uuid, text) from public, anon;
revoke all on function public.delete_school_message(uuid) from public, anon;
revoke all on function public.recent_school_messages(integer) from public, anon;
grant execute on function public.send_school_message(uuid, text) to authenticated;
grant execute on function public.edit_school_message(uuid, text) to authenticated;
grant execute on function public.delete_school_message(uuid) to authenticated;
grant execute on function public.recent_school_messages(integer) to authenticated;

-- Publication idempotente : RLS continue de filtrer les changements visibles.
do $$
begin
  alter publication supabase_realtime add table public.music_schools;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.music_school_memberships;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.school_channels;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.school_messages;
exception when duplicate_object then null;
end $$;
