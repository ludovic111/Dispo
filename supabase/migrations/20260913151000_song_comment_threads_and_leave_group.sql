-- Dispo 2.5 — fils de discussion sur les morceaux, réactions, édition et
-- départ volontaire d'un groupe.
--
-- 1. `song_comments` devient un fil à un seul niveau (comme Instagram) :
--    `parent_id` pointe sur un commentaire racine du même groupe et du même
--    morceau. Ouvrir une discussion (commentaire racine) est réservé au
--    leader ; répondre reste ouvert à tous les membres.
-- 2. `edited_at` + RPC `edit_song_comment` : l'auteur corrige son texte.
-- 3. `song_comment_reactions` : les six emojis des messages de groupe, écrits
--    uniquement via `set_song_comment_reaction` (SECURITY DEFINER).
-- 4. `leave_group` : un membre quitte un groupe ; le leader doit d'abord
--    transférer son rôle ou supprimer le groupe.
--
-- Compatibilité : les anciens clients envoient toujours des commentaires
-- racine sans `parent_id`. Pour un membre non leader, l'insertion est
-- désormais refusée proprement par la RLS (42501) ; le leader n'est pas
-- affecté. Rejouable sans effet de bord.

-- ---------------------------------------------------------------------------
-- 1. Colonnes de fil et d'édition
-- ---------------------------------------------------------------------------
alter table public.song_comments
  add column if not exists parent_id uuid references public.song_comments (id) on delete cascade,
  add column if not exists edited_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'song_comments_parent_not_self'
      and conrelid = 'public.song_comments'::regclass
  ) then
    alter table public.song_comments
      add constraint song_comments_parent_not_self check (parent_id is distinct from id);
  end if;
end $$;

create index if not exists song_comments_parent_idx
  on public.song_comments (parent_id)
  where parent_id is not null;

comment on column public.song_comments.parent_id is
  'Commentaire racine (même groupe, même morceau) auquel cette réponse se rapporte ; un seul niveau.';
comment on column public.song_comments.edited_at is
  'Dernière modification du texte par son auteur via edit_song_comment.';

-- Une réponse vise un commentaire racine du même groupe et du même morceau.
create or replace function private.validate_song_comment_reply()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.song_comments parent
    where parent.id = new.parent_id
      and parent.group_id = new.group_id
      and parent.song_id = new.song_id
      and parent.parent_id is null
  ) then
    raise exception 'song_comment_reply_unavailable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_song_comment_reply() from public, anon, authenticated;

drop trigger if exists song_comments_validate_reply on public.song_comments;
create trigger song_comments_validate_reply
  before insert or update of parent_id, group_id, song_id on public.song_comments
  for each row execute function private.validate_song_comment_reply();

-- ---------------------------------------------------------------------------
-- 2. RLS : ouvrir une discussion = leader ; répondre = membre
-- ---------------------------------------------------------------------------
drop policy if exists song_comments_insert_member on public.song_comments;
drop policy if exists song_comments_insert_leader_or_reply on public.song_comments;
create policy song_comments_insert_leader_or_reply on public.song_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (parent_id is null and public.is_group_leader(group_id))
      or (parent_id is not null and public.is_group_member(group_id))
    )
  );

-- Le texte ne se modifie que par la RPC ci-dessous : aucune policy UPDATE.
grant insert (parent_id) on public.song_comments to authenticated;

create or replace function public.edit_song_comment(p_comment uuid, p_text text)
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
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if length(v_text) < 1 or length(v_text) > 1000 then
    raise exception 'song_comment_invalid' using errcode = '22023';
  end if;
  update public.song_comments
  set text = v_text, edited_at = now()
  where id = p_comment
    and author_id = v_user;
  if not found then
    raise exception 'song_comment_not_editable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.edit_song_comment(uuid, text) from public, anon;
grant execute on function public.edit_song_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Réactions
-- ---------------------------------------------------------------------------
create table if not exists public.song_comment_reactions (
  comment_id uuid not null references public.song_comments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙌')),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (comment_id, profile_id)
);

create index if not exists song_comment_reactions_active_idx
  on public.song_comment_reactions (comment_id)
  where removed_at is null;

alter table public.song_comment_reactions enable row level security;

drop policy if exists song_comment_reactions_select_member on public.song_comment_reactions;
create policy song_comment_reactions_select_member on public.song_comment_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.song_comments c
      where c.id = comment_id and public.is_group_member(c.group_id)
    )
  );

-- Aucune policy d'écriture : tout passe par la RPC.
revoke insert, update, delete on public.song_comment_reactions from anon, authenticated;
grant select on public.song_comment_reactions to authenticated;

create or replace function public.set_song_comment_reaction(p_comment uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_emoji is not null and not (p_emoji = any (array['👍', '❤️', '😂', '😮', '😢', '🙌'])) then
    raise exception 'unsupported_reaction' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.song_comments c
    where c.id = p_comment and public.is_group_member(c.group_id)
  ) then
    raise exception 'song_comment_not_accessible' using errcode = '42501';
  end if;

  if p_emoji is null then
    update public.song_comment_reactions
    set removed_at = now()
    where comment_id = p_comment and profile_id = v_user and removed_at is null;
  else
    insert into public.song_comment_reactions (comment_id, profile_id, emoji, created_at, removed_at)
    values (p_comment, v_user, p_emoji, now(), null)
    on conflict (comment_id, profile_id) do update
    set emoji = excluded.emoji,
        created_at = now(),
        removed_at = null;
  end if;
end;
$$;

revoke all on function public.set_song_comment_reaction(uuid, text) from public, anon;
grant execute on function public.set_song_comment_reaction(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'song_comment_reactions'
  ) then
    alter publication supabase_realtime add table public.song_comment_reactions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Quitter un groupe
-- ---------------------------------------------------------------------------
-- Le répertoire (jsonb) n'est pas touché : les solos passés restent lisibles.
-- Seules l'adhésion et les présences aux dates à venir disparaissent.
create or replace function public.leave_group(p_group uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group::text || ':' || v_user::text, 25001));

  if exists (
    select 1 from public.music_groups g
    where g.id = p_group and g.leader_id = v_user
  ) then
    raise exception 'leader_must_transfer_or_delete' using errcode = '42501';
  end if;

  delete from public.group_members m
  where m.group_id = p_group and m.profile_id = v_user;
  if not found then
    return false;
  end if;

  delete from public.event_attendance a
  using public.group_events e
  where e.id = a.event_id
    and e.group_id = p_group
    and a.profile_id = v_user
    and e.date >= now();

  return true;
end;
$$;

revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;
