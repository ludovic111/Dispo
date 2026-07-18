-- Indexes de lecture et de cascade recommandes par les advisors.
create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists collaborations_b_idx on public.collaborations (b_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists reports_reported_idx on public.reports (reported_id);
create index if not exists reports_message_idx on public.reports (message_id) where message_id is not null;

-- Un utilisateur ne peut pas se faire passer pour un compte de demonstration.
create or replace function public.protect_demo_flag()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_demo is distinct from old.is_demo
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    new.is_demo := old.is_demo;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_demo on public.profiles;
create trigger profiles_protect_demo
  before update on public.profiles
  for each row execute function public.protect_demo_flag();
revoke all on function public.protect_demo_flag() from public, anon, authenticated;

-- Les policies peuvent s'appuyer directement sur la conversation visible;
-- le helper SECURITY DEFINER n'a donc pas besoin d'etre exposé.
drop policy if exists "messages_select_member_unblocked" on public.messages;
create policy "messages_select_member_unblocked"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
  );

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
  );

revoke all on function public.is_unblocked_conversation_member(uuid) from public, anon, authenticated;
revoke all on function public.is_conversation_member(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.reply_as_demo(conv_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := (select auth.uid());
  demo_id uuid;
  last_sender uuid;
  inserted_id uuid;
begin
  select
    case when c.participant_a = caller then c.participant_b else c.participant_a end
  into demo_id
  from public.conversations c
  where c.id = conv_id
    and caller in (c.participant_a, c.participant_b)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = c.participant_a and b.blocked_id = c.participant_b)
         or (b.blocker_id = c.participant_b and b.blocked_id = c.participant_a)
    );

  if demo_id is null or not exists (
    select 1 from public.profiles p where p.id = demo_id and p.is_demo = true
  ) then
    raise exception 'demo recipient required';
  end if;

  select m.sender_id into last_sender
  from public.messages m
  where m.conversation_id = conv_id
  order by m.created_at desc, m.id desc
  limit 1;

  if last_sender is distinct from caller then
    raise exception 'a new caller message is required';
  end if;

  insert into public.messages (conversation_id, sender_id, text)
  values (conv_id, demo_id, 'Merci pour ton message ! Ceci est une reponse automatique du compte de demonstration.')
  returning id into inserted_id;
  return inserted_id;
end;
$$;
revoke all on function public.reply_as_demo(uuid) from public, anon;
grant execute on function public.reply_as_demo(uuid) to authenticated;
