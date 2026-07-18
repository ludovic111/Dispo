-- Dispo 0.9.1 — distinction demo/reel, graphe social serveur et securite UGC.

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.follows enable row level security;
grant select, insert, delete on public.follows to authenticated;

create policy "follows_select_authenticated"
  on public.follows for select to authenticated using (true);
create policy "follows_insert_own"
  on public.follows for insert to authenticated
  with check ((select auth.uid()) = follower_id);
create policy "follows_delete_own"
  on public.follows for delete to authenticated
  using ((select auth.uid()) = follower_id);

create table if not exists public.collaborations (
  a_id uuid not null references public.profiles (id) on delete cascade,
  b_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a_id, b_id),
  check (a_id < b_id)
);

alter table public.collaborations enable row level security;
grant select, insert, delete on public.collaborations to authenticated;

create policy "collaborations_select_authenticated"
  on public.collaborations for select to authenticated using (true);
create policy "collaborations_insert_involved"
  on public.collaborations for insert to authenticated
  with check ((select auth.uid()) = a_id or (select auth.uid()) = b_id);
create policy "collaborations_delete_involved"
  on public.collaborations for delete to authenticated
  using ((select auth.uid()) = a_id or (select auth.uid()) = b_id);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;
grant select, insert, delete on public.blocks to authenticated;

create policy "blocks_select_own"
  on public.blocks for select to authenticated
  using ((select auth.uid()) = blocker_id);
create policy "blocks_insert_own"
  on public.blocks for insert to authenticated
  with check ((select auth.uid()) = blocker_id);
create policy "blocks_delete_own"
  on public.blocks for delete to authenticated
  using ((select auth.uid()) = blocker_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  reason text not null check (length(reason) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'closed')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

alter table public.reports enable row level security;
grant select, insert on public.reports to authenticated;

create policy "reports_select_own"
  on public.reports for select to authenticated
  using ((select auth.uid()) = reporter_id);
create policy "reports_insert_own"
  on public.reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id and status = 'pending');

-- Un blocage masque la conversation et empeche les nouveaux messages dans
-- les deux sens. La lecture de profils reste publique aux membres du reseau;
-- l'app retire en plus les profils bloques de ses listes.
drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own_unblocked"
  on public.conversations for select to authenticated
  using (
    (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = participant_a and b.blocked_id = participant_b)
         or (b.blocker_id = participant_b and b.blocked_id = participant_a)
    )
  );

drop policy if exists "messages_select_member" on public.messages;
create or replace function public.is_unblocked_conversation_member(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conv_id
      and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = c.participant_a and b.blocked_id = c.participant_b)
           or (b.blocker_id = c.participant_b and b.blocked_id = c.participant_a)
      )
  )
$$;
revoke all on function public.is_unblocked_conversation_member(uuid) from public, anon;
grant execute on function public.is_unblocked_conversation_member(uuid) to authenticated;

create policy "messages_select_member_unblocked"
  on public.messages for select to authenticated
  using (public.is_unblocked_conversation_member(conversation_id));

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member_unblocked"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_unblocked_conversation_member(conversation_id));

-- Suppression complete initiee depuis l'app. Aucun parametre utilisateur :
-- la fonction ne peut supprimer que l'identite de la session courante.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = auth, public, pg_temp
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'authentication required';
  end if;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Reponse automatique uniquement pour l'autre participant lorsqu'il s'agit
-- explicitement d'un compte de demonstration. Un vrai profil ne peut jamais
-- etre usurpe par ce mecanisme.
create or replace function public.reply_as_demo(conv_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := (select auth.uid());
  demo_id uuid;
  inserted_id uuid;
begin
  select case when c.participant_a = caller then c.participant_b else c.participant_a end
    into demo_id
  from public.conversations c
  where c.id = conv_id and caller in (c.participant_a, c.participant_b);

  if demo_id is null or not exists (
    select 1 from public.profiles p where p.id = demo_id and p.is_demo = true
  ) then
    raise exception 'demo recipient required';
  end if;

  insert into public.messages (conversation_id, sender_id, text)
  values (conv_id, demo_id, 'Merci pour ton message ! Ceci est une reponse automatique du compte de demonstration.')
  returning id into inserted_id;
  return inserted_id;
end;
$$;
revoke all on function public.reply_as_demo(uuid) from public, anon;
grant execute on function public.reply_as_demo(uuid) to authenticated;

-- applied via MCP: les comptes @demo.dispo.ch et les relations exemples
-- seront marques/semes sur le projet heberge apres application.
