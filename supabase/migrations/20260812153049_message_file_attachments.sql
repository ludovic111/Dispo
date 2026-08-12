-- Dispo 1.9 — fichiers et partitions dans les conversations privées et de groupe.
--
-- Les objets restent dans un bucket privé. Le chemin porte le contexte,
-- l'identité de la conversation/du groupe puis l'expéditeur :
--   conversation/<conversation_id>/<sender_id>/<file_id>.<ext>
--   group/<group_id>/<sender_id>/<file_id>.<ext>

alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

alter table public.group_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_or_attachment_check
  check (
    length(text) <= 4000
    and (length(btrim(text)) >= 1 or attachment_path is not null)
  );
alter table public.messages add constraint messages_attachment_consistent_check
  check (
    (attachment_path is null and attachment_name is null and attachment_type is null and attachment_size is null)
    or (
      attachment_path is not null
      and length(attachment_path) between 1 and 600
      and attachment_name is not null and length(attachment_name) between 1 and 255
      and attachment_type is not null and length(attachment_type) between 1 and 150
      and attachment_size between 1 and 20971520
    )
  );

alter table public.group_messages drop constraint if exists group_messages_text_check;
alter table public.group_messages add constraint group_messages_text_or_attachment_check
  check (
    length(text) <= 4000
    and (length(btrim(text)) >= 1 or attachment_path is not null)
  );
alter table public.group_messages add constraint group_messages_attachment_consistent_check
  check (
    (attachment_path is null and attachment_name is null and attachment_type is null and attachment_size is null)
    or (
      attachment_path is not null
      and length(attachment_path) between 1 and 600
      and attachment_name is not null and length(attachment_name) between 1 and 255
      and attachment_type is not null and length(attachment_type) between 1 and 150
      and attachment_size between 1 and 20971520
    )
  );

-- Les métadonnées d'un fichier doivent pointer vers le contexte du message.
drop policy if exists "messages_insert_member_unblocked" on public.messages;
create policy "messages_insert_member_unblocked"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
    and (
      attachment_path is null
      or attachment_path like 'conversation/' || conversation_id::text || '/' || sender_id::text || '/%'
    )
  );

drop policy if exists "group_messages_insert_self_member" on public.group_messages;
create policy "group_messages_insert_self_member"
  on public.group_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_group_member(group_id)
    and (
      attachment_path is null
      or attachment_path like 'group/' || group_id::text || '/' || sender_id::text || '/%'
    )
  );

-- Tous les types sont acceptés, mais jamais plus de 20 Mo. Le bucket est
-- privé et Quick Look décide ensuite si l'appareil sait prévisualiser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-files', 'message-files', false, 20971520, null)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

create policy message_files_select_participant on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-files'
    and (
      (
        (storage.foldername(name))[1] = 'conversation'
        and exists (
          select 1 from public.conversations c
          where c.id = public.try_uuid((storage.foldername(name))[2])
            and ((select auth.uid()) = c.participant_a or (select auth.uid()) = c.participant_b)
        )
      )
      or (
        (storage.foldername(name))[1] = 'group'
        and public.is_group_member(public.try_uuid((storage.foldername(name))[2]))
      )
    )
  );

create policy message_files_insert_participant on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-files'
    and public.try_uuid((storage.foldername(name))[3]) = (select auth.uid())
    and (
      (
        (storage.foldername(name))[1] = 'conversation'
        and exists (
          select 1 from public.conversations c
          where c.id = public.try_uuid((storage.foldername(name))[2])
            and ((select auth.uid()) = c.participant_a or (select auth.uid()) = c.participant_b)
        )
      )
      or (
        (storage.foldername(name))[1] = 'group'
        and public.is_group_member(public.try_uuid((storage.foldername(name))[2]))
      )
    )
  );

-- Permet au client de nettoyer un upload si l'INSERT du message échoue.
create policy message_files_delete_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-files'
    and public.try_uuid((storage.foldername(name))[3]) = (select auth.uid())
  );

-- Une pièce jointe sans texte garde une notification explicite.
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
  select case when c.participant_a = new.sender_id then c.participant_b else c.participant_a end
  into recipient from public.conversations c where c.id = new.conversation_id;

  if recipient is null or exists (
    select 1 from public.blocks b
    where (b.blocker_id = recipient and b.blocked_id = new.sender_id)
       or (b.blocker_id = new.sender_id and b.blocked_id = recipient)
  ) then return new; end if;

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
      left(coalesce(nullif(btrim(new.text), ''), '📎 ' || new.attachment_name), 180),
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

create or replace function public.queue_group_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
  group_name text;
begin
  select coalesce(nullif(p.name, ''), 'Un musicien') into sender_name
  from public.profiles p where p.id = new.sender_id;
  select g.name into group_name from public.music_groups g where g.id = new.group_id;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    m.profile_id, new.sender_id, 'groups', coalesce(group_name, 'Groupe'),
    left(sender_name || ' : ' || coalesce(nullif(btrim(new.text), ''), '📎 ' || new.attachment_name), 180),
    jsonb_build_object(
      'category', 'groups', 'target_tab', 'messages', 'group_id', new.group_id::text
    ),
    'group_messages', new.id
  from public.group_members m
  where m.group_id = new.group_id
    and m.profile_id <> new.sender_id
    and exists (
      select 1 from public.push_devices d
      where d.user_id = m.profile_id and d.notifications_enabled and d.groups_enabled
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

revoke all on function public.queue_message_push() from public, anon, authenticated;
revoke all on function public.queue_group_message_push() from public, anon, authenticated;
