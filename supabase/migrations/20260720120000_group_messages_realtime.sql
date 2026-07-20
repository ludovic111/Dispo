-- Dispo 0.9.4 — messagerie de groupe côté serveur + temps réel.
--
-- Jusqu'ici les messages de groupe restaient sur l'appareil (« phase 2b ») :
-- chaque membre ne voyait que ses propres messages, et les actions des autres
-- (événements, présence, membres) n'apparaissaient qu'au relancement de
-- l'app. Cette migration crée la table `group_messages` (RLS membres
-- uniquement) et publie les tables de groupe sur le canal realtime pour que
-- l'app puisse s'y abonner comme elle le fait déjà pour `messages`.

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.music_groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (length(text) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index group_messages_group_created_idx
  on public.group_messages (group_id, created_at);
create index group_messages_sender_idx
  on public.group_messages (sender_id);

alter table public.group_messages enable row level security;

create policy "group_messages_select_member"
  on public.group_messages for select to authenticated
  using (public.is_group_member(group_id));

-- On écrit uniquement en son nom, et uniquement dans ses groupes.
create policy "group_messages_insert_self_member"
  on public.group_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_group_member(group_id)
  );

-- Pas d'update : un message envoyé ne se réécrit pas. La suppression suit
-- la cascade du groupe.

-- Publication realtime : messages de groupe en incrémental, et tables de
-- groupe pour rafraîchir quand un membre agit (événement créé, présence,
-- roster, répertoire). RLS s'applique aussi aux payloads realtime.
alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.group_events;
alter publication supabase_realtime add table public.event_attendance;
alter publication supabase_realtime add table public.group_members;
alter publication supabase_realtime add table public.music_groups;
