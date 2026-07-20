-- Push sur les messages de groupe : chaque INSERT dans group_messages met en
-- file une notification pour les membres du groupe (sauf l'expéditeur), en
-- respectant la préférence « groupes » et les blocages — même modèle que les
-- triggers 0.9.2.

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

  select g.name into group_name
  from public.music_groups g where g.id = new.group_id;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    m.profile_id,
    new.sender_id,
    'groups',
    coalesce(group_name, 'Groupe'),
    left(sender_name || ' : ' || new.text, 180),
    jsonb_build_object(
      'category', 'groups', 'target_tab', 'messages',
      'group_id', new.group_id::text
    ),
    'group_messages',
    new.id
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

create trigger group_messages_queue_push
  after insert on public.group_messages
  for each row execute function public.queue_group_message_push();

revoke all on function public.queue_group_message_push() from public, anon, authenticated;
