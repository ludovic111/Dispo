-- Dispo 1.3 — les partitions se rangent sous les morceaux, et chaque
-- morceau a son fil de commentaires.
--
-- 1. `group_docs.song_id` : une partition appartient à un morceau du
--    répertoire (nil = partition libre du groupe, comme avant).
-- 2. `song_comments` : tout le monde peut commenter un morceau — doigtés,
--    « on l'attaque au refrain », un lien vers une version. Rien de
--    hiérarchique : ce n'est pas réservé au leader.
-- 3. `group_docs.instrument` : une partition peut viser un instrument
--    précis (la partie de sax alto), ou tout le monde (nil).

alter table public.group_docs
  add column if not exists song_id uuid,
  add column if not exists instrument text;

create index if not exists group_docs_song_idx
  on public.group_docs (song_id)
  where song_id is not null;

create table if not exists public.song_comments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.music_groups (id) on delete cascade,
  -- Identifiant du morceau dans le jsonb `music_groups.repertoire` : pas de
  -- clé étrangère possible, le répertoire n'est pas une table.
  song_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists song_comments_group_song_idx
  on public.song_comments (group_id, song_id, created_at);
create index if not exists song_comments_author_idx
  on public.song_comments (author_id);

alter table public.song_comments enable row level security;

-- Lire : les membres du groupe. Écrire : soi-même, et seulement chez soi.
create policy song_comments_select_member on public.song_comments
  for select to authenticated
  using (public.is_group_member(group_id));

create policy song_comments_insert_member on public.song_comments
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and author_id = (select auth.uid())
  );

-- Effacer : son propre commentaire, ou n'importe lequel si on est leader
-- (modération du groupe).
create policy song_comments_delete_author_or_leader on public.song_comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_group_leader(group_id)
  );

-- Realtime : les commentaires arrivent sans relancer l'app.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'song_comments'
  ) then
    alter publication supabase_realtime add table public.song_comments;
  end if;
end $$;
