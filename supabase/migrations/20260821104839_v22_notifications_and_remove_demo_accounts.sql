-- Dispo 2.2 — centre de notifications, badges exacts et suppression
-- définitive des anciens comptes de démonstration.

-- Les 20 comptes seed historiques n'ont jamais été de vrais utilisateurs.
-- Supprimer auth.users déclenche les cascades déjà déclarées vers profiles,
-- conversations, groupes et contenus associés. Le DELETE profiles couvre un
-- éventuel profil orphelin créé avant l'ajout de la FK auth.
delete from auth.users u
using public.profiles p
where p.id = u.id
  and coalesce(p.is_demo, false);

delete from public.profiles
where coalesce(is_demo, false);

-- Aucun futur profil ne peut redevenir un compte fabriqué. On conserve la
-- colonne pour la compatibilité des anciens clients, mais elle est verrouillée
-- à false côté base.
update public.profiles set is_demo = false where is_demo is null;
alter table public.profiles alter column is_demo set default false;
alter table public.profiles alter column is_demo set not null;
alter table public.profiles drop constraint if exists profiles_no_demo_accounts;
alter table public.profiles add constraint profiles_no_demo_accounts
  check (is_demo = false);

-- Une notification reste dans le centre après sa livraison APNs. read_at est
-- indépendant de sent_at : l'un signifie « Apple l'a reçue », l'autre « la
-- personne l'a consultée ».
alter table public.push_notifications
  add column if not exists read_at timestamptz;

create index if not exists push_notifications_user_unread_idx
  on public.push_notifications (user_id, created_at desc)
  where read_at is null;

revoke update on public.push_notifications from anon, authenticated;
grant update (read_at) on public.push_notifications to authenticated;

drop policy if exists "push_notifications_update_read_own" on public.push_notifications;
create policy "push_notifications_update_read_own"
  on public.push_notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- La table existait avant les nouveaux réglages Realtime et n'était pas dans
-- la publication. L'ajout est idempotent pour les environnements déjà réglés.
do $$
begin
  alter publication supabase_realtime add table public.push_notifications;
exception
  when duplicate_object then null;
end;
$$;

-- Une pièce jointe sans texte annonce clairement son type, aussi bien sur
-- l'écran verrouillé que dans le centre de notifications.
create or replace function public.queue_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  sender_name text;
  attachment_label text;
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

  attachment_label := case
    when new.attachment_type like 'image/%' then '📷 Photo'
    when new.attachment_type like 'video/%' then '🎥 Vidéo'
    else '📎 ' || coalesce(new.attachment_name, 'Fichier')
  end;

  if exists (
    select 1 from public.push_devices d
    where d.user_id = recipient and d.notifications_enabled and d.messages_enabled
  ) then
    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    values (
      recipient, new.sender_id, 'messages', sender_name,
      left(coalesce(nullif(btrim(new.text), ''), attachment_label), 180),
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
  attachment_label text;
begin
  select coalesce(nullif(p.name, ''), 'Un musicien') into sender_name
  from public.profiles p where p.id = new.sender_id;
  select g.name into group_name from public.music_groups g where g.id = new.group_id;

  attachment_label := case
    when new.attachment_type like 'image/%' then '📷 Photo'
    when new.attachment_type like 'video/%' then '🎥 Vidéo'
    else '📎 ' || coalesce(new.attachment_name, 'Fichier')
  end;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    m.profile_id, new.sender_id, 'groups', coalesce(group_name, 'Groupe'),
    left(sender_name || ' : ' || coalesce(nullif(btrim(new.text), ''), attachment_label), 180),
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
