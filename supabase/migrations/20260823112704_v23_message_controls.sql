-- Dispo 2.3 — édition, suppression logique et réactions de messages.
--
-- Les mutations passent exclusivement par des RPC SECURITY DEFINER qui
-- valident auth.uid(), l'auteur et l'accès au contexte. Les clients gardent
-- uniquement SELECT/INSERT direct pour la lecture et l'envoi initial.

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- Une suppression garde une tombstone synchronisable par UPDATE, mais retire
-- tout contenu et toute référence au fichier privé.
alter table public.messages drop constraint if exists messages_text_or_attachment_check;
alter table public.messages add constraint messages_text_or_attachment_check
  check (
    (
      deleted_at is not null
      and text = ''
      and attachment_path is null
      and attachment_name is null
      and attachment_type is null
      and attachment_size is null
    )
    or (
      deleted_at is null
      and length(text) <= 4000
      and (length(btrim(text)) >= 1 or attachment_path is not null)
    )
  );

alter table public.group_messages drop constraint if exists group_messages_text_or_attachment_check;
alter table public.group_messages add constraint group_messages_text_or_attachment_check
  check (
    (
      deleted_at is not null
      and text = ''
      and attachment_path is null
      and attachment_name is null
      and attachment_type is null
      and attachment_size is null
    )
    or (
      deleted_at is null
      and length(text) <= 4000
      and (length(btrim(text)) >= 1 or attachment_path is not null)
    )
  );

-- Les grants Supabase par défaut couvrent toutes les colonnes. Les RPC ci-dessous
-- deviennent la seule voie de modification/suppression afin de préserver les
-- accusés de lecture, l'auteur, la date et le chemin Storage.
revoke all on table public.messages from anon;
revoke all on table public.group_messages from anon;
revoke update, delete on table public.messages from authenticated;
revoke update, delete on table public.group_messages from authenticated;
revoke insert on table public.messages from authenticated;
revoke insert on table public.group_messages from authenticated;
grant select on table public.messages to authenticated;
grant select on table public.group_messages to authenticated;
grant insert (
  id, conversation_id, sender_id, text,
  attachment_path, attachment_name, attachment_type, attachment_size
) on public.messages to authenticated;
grant insert (
  id, group_id, sender_id, text,
  attachment_path, attachment_name, attachment_type, attachment_size
) on public.group_messages to authenticated;

-- Le helper voit les blocages dans les deux sens (les policies de blocks ne
-- montrent normalement qu'au bloqueur ses propres lignes).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_unblocked_conversation_member(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conv_id
      and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = c.participant_a and b.blocked_id = c.participant_b)
           or (b.blocker_id = c.participant_b and b.blocked_id = c.participant_a)
      )
  );
$$;
revoke all on function private.is_unblocked_conversation_member(uuid) from public, anon;
grant execute on function private.is_unblocked_conversation_member(uuid) to authenticated;

drop policy if exists conversations_select_own_unblocked on public.conversations;
create policy conversations_select_own_unblocked
on public.conversations for select to authenticated
using (private.is_unblocked_conversation_member(id));

drop policy if exists messages_select_member_unblocked on public.messages;
create policy messages_select_member_unblocked
on public.messages for select to authenticated
using (private.is_unblocked_conversation_member(conversation_id));

drop policy if exists messages_insert_member_unblocked on public.messages;
create policy messages_insert_member_unblocked
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and private.is_unblocked_conversation_member(conversation_id)
  and (
    attachment_path is null
    or attachment_path like 'conversation/' || conversation_id::text || '/' || sender_id::text || '/%'
  )
);

create table if not exists public.message_file_cleanup (
  path text primary key,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  check (
    path like 'conversation/%/' || owner_id::text || '/%'
    or path like 'group/%/' || owner_id::text || '/%'
  )
);
create index if not exists message_file_cleanup_owner_idx
  on public.message_file_cleanup(owner_id);
alter table public.message_file_cleanup enable row level security;
revoke all on table public.message_file_cleanup from public, anon, authenticated;
grant select on table public.message_file_cleanup to authenticated;
drop policy if exists message_file_cleanup_select_own on public.message_file_cleanup;
create policy message_file_cleanup_select_own
on public.message_file_cleanup for select to authenticated
using (owner_id = (select auth.uid()));

-- Un signalement conserve une preuve minimale du contenu tel qu'il était au
-- moment du signalement. La suppression pour les participants reste totale,
-- mais ne rend pas une modération déjà demandée impossible.
alter table public.reports
  add column if not exists message_snapshot jsonb;

create or replace function public.capture_reported_message_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
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
    and new.reporter_id = auth.uid()
    and (c.participant_a = new.reporter_id or c.participant_b = new.reporter_id);

  if v_snapshot is null then
    raise exception 'Invalid reported message' using errcode = '42501';
  end if;
  new.message_snapshot := v_snapshot;
  return new;
end;
$$;

drop trigger if exists reports_capture_message_snapshot on public.reports;
create trigger reports_capture_message_snapshot
before insert on public.reports
for each row execute function public.capture_reported_message_snapshot();

create or replace function public.edit_message(p_message uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_text) > 4000 then
    raise exception 'Message too long' using errcode = '22001';
  end if;

  update public.messages m
  set text = v_text,
      edited_at = now()
  where m.id = p_message
    and m.sender_id = v_user
    and m.deleted_at is null
    and (v_text <> '' or m.attachment_path is not null)
    and exists (
      select 1
      from public.conversations c
      where c.id = m.conversation_id
        and (c.participant_a = v_user or c.participant_b = v_user)
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = c.participant_a and b.blocked_id = c.participant_b)
             or (b.blocker_id = c.participant_b and b.blocked_id = c.participant_a)
        )
    );
  if not found then
    raise exception 'Message not editable' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_message(p_message uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_path text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select m.attachment_path
  into v_path
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = p_message
    and m.sender_id = v_user
    and m.deleted_at is null
    and (c.participant_a = v_user or c.participant_b = v_user)
  for update of m;
  if not found then
    raise exception 'Message not deletable' using errcode = '42501';
  end if;

  update public.messages
  set text = '',
      attachment_path = null,
      attachment_name = null,
      attachment_type = null,
      attachment_size = null,
      deleted_at = now()
  where id = p_message;
  if v_path is not null then
    insert into public.message_file_cleanup(path, owner_id)
    values (v_path, v_user)
    on conflict (path) do update set created_at = now();
  end if;
  update public.message_reactions
  set removed_at = now()
  where message_id = p_message and removed_at is null;
  update public.push_notifications
  set body = 'Message supprimé'
  where source_table = 'messages' and source_id = p_message;
  return v_path;
end;
$$;

create or replace function public.edit_group_message(p_message uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_text) > 4000 then
    raise exception 'Message too long' using errcode = '22001';
  end if;

  update public.group_messages gm
  set text = v_text,
      edited_at = now()
  where gm.id = p_message
    and gm.sender_id = v_user
    and gm.deleted_at is null
    and (v_text <> '' or gm.attachment_path is not null)
    and public.is_group_member(gm.group_id);
  if not found then
    raise exception 'Group message not editable' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_group_message(p_message uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_path text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select gm.attachment_path
  into v_path
  from public.group_messages gm
  where gm.id = p_message
    and gm.sender_id = v_user
    and gm.deleted_at is null
    and public.is_group_member(gm.group_id)
  for update;
  if not found then
    raise exception 'Group message not deletable' using errcode = '42501';
  end if;

  update public.group_messages
  set text = '',
      attachment_path = null,
      attachment_name = null,
      attachment_type = null,
      attachment_size = null,
      deleted_at = now()
  where id = p_message;
  if v_path is not null then
    insert into public.message_file_cleanup(path, owner_id)
    values (v_path, v_user)
    on conflict (path) do update set created_at = now();
  end if;
  update public.group_message_reactions
  set removed_at = now()
  where message_id = p_message and removed_at is null;
  update public.push_notifications
  set body = 'Message supprimé'
  where source_table = 'group_messages' and source_id = p_message;
  return v_path;
end;
$$;

create or replace function public.complete_message_file_cleanup(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.message_file_cleanup
  where path = p_path and owner_id = auth.uid();
end;
$$;

create or replace function public.queue_message_file_cleanup(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null
     or not (
       p_path like 'conversation/%/' || v_user::text || '/%'
       or p_path like 'group/%/' || v_user::text || '/%'
     ) then
    raise exception 'File not owned by caller' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.messages
    where attachment_path = p_path and deleted_at is null
  ) or exists (
    select 1 from public.group_messages
    where attachment_path = p_path and deleted_at is null
  ) then
    raise exception 'File is still attached' using errcode = '23503';
  end if;
  insert into public.message_file_cleanup(path, owner_id)
  values (p_path, v_user)
  on conflict (path) do update set created_at = now();
end;
$$;

create or replace function public.prepare_my_message_file_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.message_file_cleanup(path, owner_id)
  select attachment_path, v_user
  from public.messages
  where sender_id = v_user and attachment_path is not null
  on conflict (path) do update set created_at = now();
  insert into public.message_file_cleanup(path, owner_id)
  select attachment_path, v_user
  from public.group_messages
  where sender_id = v_user and attachment_path is not null
  on conflict (path) do update set created_at = now();

  update public.messages
  set text = '', attachment_path = null, attachment_name = null,
      attachment_type = null, attachment_size = null, deleted_at = now()
  where sender_id = v_user and deleted_at is null;
  update public.group_messages
  set text = '', attachment_path = null, attachment_name = null,
      attachment_type = null, attachment_size = null, deleted_at = now()
  where sender_id = v_user and deleted_at is null;
end;
$$;

-- Garde-fou final : l'app doit vider Storage avant de supprimer l'identité.
-- En cas de coupure, le compte reste actif et peut reprendre le nettoyage.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.message_file_cleanup
    where owner_id = v_user
  ) then
    raise exception 'Pending file cleanup' using errcode = '55000';
  end if;
  if exists (
    select 1 from storage.objects
    where owner_id = v_user::text
  ) then
    raise exception 'Pending Storage objects' using errcode = '55000';
  end if;
  delete from auth.users where id = v_user;
  if exists (
    select 1 from public.message_file_cleanup
    where owner_id = v_user
  ) then
    raise exception 'Concurrent file cleanup' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.queue_deleted_message_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.attachment_path is not null then
    insert into public.message_file_cleanup(path, owner_id)
    values (old.attachment_path, old.sender_id)
    on conflict (path) do update set created_at = now();
  end if;
  return old;
end;
$$;

drop trigger if exists messages_queue_file_before_delete on public.messages;
create trigger messages_queue_file_before_delete
before delete on public.messages
for each row execute function public.queue_deleted_message_file();
drop trigger if exists group_messages_queue_file_before_delete on public.group_messages;
create trigger group_messages_queue_file_before_delete
before delete on public.group_messages
for each row execute function public.queue_deleted_message_file();

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji = any (array['👍', '❤️', '😂', '😮', '😢', '🙌'])),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (message_id, profile_id)
);

create table if not exists public.group_message_reactions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji = any (array['👍', '❤️', '😂', '😮', '😢', '🙌'])),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (message_id, profile_id)
);

alter table public.message_reactions enable row level security;
alter table public.group_message_reactions enable row level security;

create index if not exists message_reactions_profile_idx
  on public.message_reactions(profile_id);
create index if not exists group_message_reactions_profile_idx
  on public.group_message_reactions(profile_id);
create index if not exists messages_live_attachment_path_idx
  on public.messages(attachment_path)
  where attachment_path is not null and deleted_at is null;
create index if not exists group_messages_live_attachment_path_idx
  on public.group_messages(attachment_path)
  where attachment_path is not null and deleted_at is null;

-- Deux acceptations simultanées ne peuvent plus attribuer le même poste SOS
-- à deux musiciens. Le contrôle préalable en production ne trouvait aucun
-- doublon existant.
create unique index if not exists gig_applications_one_accepted_slot_idx
  on public.gig_applications(gig_id, instrument)
  where status = 'accepted';

drop policy if exists message_reactions_select_participant on public.message_reactions;
create policy message_reactions_select_participant
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_reactions.message_id
      and m.deleted_at is null
      and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
  )
);

drop policy if exists group_message_reactions_select_member on public.group_message_reactions;
create policy group_message_reactions_select_member
on public.group_message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.group_messages gm
    where gm.id = group_message_reactions.message_id
      and gm.deleted_at is null
      and public.is_group_member(gm.group_id)
  )
);

revoke all on table public.message_reactions from public, anon, authenticated;
revoke all on table public.group_message_reactions from public, anon, authenticated;
grant select on table public.message_reactions to authenticated;
grant select on table public.group_message_reactions to authenticated;

create or replace function public.set_message_reaction(p_message uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_emoji is not null and not (p_emoji = any (array['👍', '❤️', '😂', '😮', '😢', '🙌'])) then
    raise exception 'Unsupported reaction' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message
      and m.deleted_at is null
      and (c.participant_a = v_user or c.participant_b = v_user)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = c.participant_a and b.blocked_id = c.participant_b)
           or (b.blocker_id = c.participant_b and b.blocked_id = c.participant_a)
      )
  ) then
    raise exception 'Message not accessible' using errcode = '42501';
  end if;

  if p_emoji is null then
    update public.message_reactions
    set removed_at = now()
    where message_id = p_message and profile_id = v_user and removed_at is null;
  else
    insert into public.message_reactions(message_id, profile_id, emoji, created_at, removed_at)
    values (p_message, v_user, p_emoji, now(), null)
    on conflict (message_id, profile_id) do update
    set emoji = excluded.emoji,
        created_at = now(),
        removed_at = null;
  end if;
end;
$$;

create or replace function public.set_group_message_reaction(p_message uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_emoji is not null and not (p_emoji = any (array['👍', '❤️', '😂', '😮', '😢', '🙌'])) then
    raise exception 'Unsupported reaction' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.group_messages gm
    where gm.id = p_message
      and gm.deleted_at is null
      and public.is_group_member(gm.group_id)
  ) then
    raise exception 'Group message not accessible' using errcode = '42501';
  end if;

  if p_emoji is null then
    update public.group_message_reactions
    set removed_at = now()
    where message_id = p_message and profile_id = v_user and removed_at is null;
  else
    insert into public.group_message_reactions(message_id, profile_id, emoji, created_at, removed_at)
    values (p_message, v_user, p_emoji, now(), null)
    on conflict (message_id, profile_id) do update
    set emoji = excluded.emoji,
        created_at = now(),
        removed_at = null;
  end if;
end;
$$;

-- Historique borné par conversation/groupe : l'ouverture de l'app ne relit
-- plus une table entière quand les échanges grossissent.
create or replace function public.recent_messages(p_limit integer default 60)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  select m.*
  from public.messages m
  join (
    select id, row_number() over (
      partition by conversation_id order by created_at desc, id desc
    ) as position
    from public.messages
  ) ranked on ranked.id = m.id
  where ranked.position <= least(greatest(p_limit, 1), 100)
  order by m.created_at, m.id;
$$;

create or replace function public.recent_group_messages(p_limit integer default 60)
returns setof public.group_messages
language sql
stable
security invoker
set search_path = ''
as $$
  select gm.*
  from public.group_messages gm
  join (
    select id, row_number() over (
      partition by group_id order by created_at desc, id desc
    ) as position
    from public.group_messages
  ) ranked on ranked.id = gm.id
  where ranked.position <= least(greatest(p_limit, 1), 100)
  order by gm.created_at, gm.id;
$$;

revoke all on function public.edit_message(uuid, text) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
revoke all on function public.edit_group_message(uuid, text) from public, anon;
revoke all on function public.delete_group_message(uuid) from public, anon;
revoke all on function public.set_message_reaction(uuid, text) from public, anon;
revoke all on function public.set_group_message_reaction(uuid, text) from public, anon;
revoke all on function public.complete_message_file_cleanup(text) from public, anon;
revoke all on function public.queue_message_file_cleanup(text) from public, anon;
revoke all on function public.prepare_my_message_file_cleanup() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.queue_deleted_message_file() from public, anon, authenticated;
revoke all on function public.capture_reported_message_snapshot() from public, anon, authenticated;
revoke all on function public.recent_messages(integer) from public, anon;
revoke all on function public.recent_group_messages(integer) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.edit_group_message(uuid, text) to authenticated;
grant execute on function public.delete_group_message(uuid) to authenticated;
grant execute on function public.set_message_reaction(uuid, text) to authenticated;
grant execute on function public.set_group_message_reaction(uuid, text) to authenticated;
grant execute on function public.complete_message_file_cleanup(text) to authenticated;
grant execute on function public.queue_message_file_cleanup(text) to authenticated;
grant execute on function public.prepare_my_message_file_cleanup() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.recent_messages(integer) to authenticated;
grant execute on function public.recent_group_messages(integer) to authenticated;

-- Après suppression, même un ancien chemin ne peut plus être resigné : la
-- lecture Storage exige désormais une référence vivante en base.
drop policy if exists message_files_select_participant on storage.objects;
create policy message_files_select_participant on storage.objects
for select to authenticated
using (
  bucket_id = 'message-files'
  and (
    exists (
      select 1
      from public.messages m
      where m.attachment_path = name
        and m.deleted_at is null
        and private.is_unblocked_conversation_member(m.conversation_id)
    )
    or exists (
      select 1
      from public.group_messages gm
      where gm.attachment_path = name
        and gm.deleted_at is null
        and public.is_group_member(gm.group_id)
    )
  )
);

drop policy if exists message_files_insert_participant on storage.objects;
create policy message_files_insert_participant on storage.objects
for insert to authenticated
with check (
  bucket_id = 'message-files'
  and public.try_uuid((storage.foldername(name))[3]) = (select auth.uid())
  and (
    (
      (storage.foldername(name))[1] = 'conversation'
      and private.is_unblocked_conversation_member(
        public.try_uuid((storage.foldername(name))[2])
      )
    )
    or (
      (storage.foldername(name))[1] = 'group'
      and public.is_group_member(public.try_uuid((storage.foldername(name))[2]))
    )
  )
);

-- L'ancienne fonction publique n'est plus nécessaire et ne doit pas rester
-- exposée comme RPC.
drop function if exists public.is_unblocked_conversation_member(uuid);

drop policy if exists message_files_delete_owner on storage.objects;
create policy message_files_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'message-files'
  and exists (
    select 1
    from public.message_file_cleanup q
    where q.path = name and q.owner_id = (select auth.uid())
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
    ) then
      alter publication supabase_realtime add table public.message_reactions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_message_reactions'
    ) then
      alter publication supabase_realtime add table public.group_message_reactions;
    end if;
  end if;
end
$$;

comment on column public.messages.edited_at is 'Dernière modification volontaire du texte.';
comment on column public.messages.deleted_at is 'Suppression logique synchronisée; contenu et fichier retirés.';
comment on column public.group_messages.edited_at is 'Dernière modification volontaire du texte.';
comment on column public.group_messages.deleted_at is 'Suppression logique synchronisée; contenu et fichier retirés.';
