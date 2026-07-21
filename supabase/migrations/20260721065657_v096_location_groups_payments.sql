-- 0.9.6 : partage de position à trois niveaux, groupes publics avec photo,
-- moyen de versement du cachet SOS, et correctifs Storage.
--
-- 1. Position : `profiles.latitude/longitude` ne contient plus que la
--    position « niveau ville » (grille ~5 km). La position exacte (~100 m)
--    vit dans `profile_locations`, lisible uniquement selon la préférence
--    du propriétaire (`location_precision`) : personne (city), amis
--    mutuels (exact_friends) ou tout le monde (exact_everyone).
-- 2. Groupes : `photo_url` + `is_public`. Les groupes publics d'un profil
--    sont exposés via la fonction `profile_public_groups` (SECURITY
--    DEFINER) — la RLS des tables de groupes reste inchangée, l'app
--    continue de ne charger que SES groupes par les policies membres.
-- 3. SOS : `gig_requests.payment_method` (twint / transfer / cash /
--    cashapp / texte libre), exposé par la vue feed même pendant
--    l'avant-première (comme le cachet).
-- 4. Storage : le durcissement du 20.07 a retiré TOUTES les policies
--    SELECT sur storage.objects — or l'upload `upsert` (remplacement de
--    photo de profil) a besoin de voir l'objet existant : chaque
--    remplacement échouait en 409. On rétablit un SELECT limité à son
--    propre dossier (pas d'énumération des autres). Le bucket demo-videos
--    accepte aussi les JPEG (miniatures des vidéos).

-- ===== 1. Position ==========================================================

alter table public.profiles
  add column if not exists location_precision text not null default 'city'
    check (location_precision in ('city', 'exact_friends', 'exact_everyone'));

-- Les coordonnées déjà partagées (arrondies ~1 km en 0.9.4/0.9.5) sont
-- re-floutées au niveau ville. Les profils de démo gardent leur position
-- scénographiée (fictive, non sensible).
update public.profiles
   set latitude = round((latitude / 0.05)::numeric) * 0.05,
       longitude = round((longitude / 0.05)::numeric) * 0.05
 where latitude is not null
   and is_demo = false;

create table public.profile_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.profile_locations enable row level security;

-- Lecture : moi, ou selon la préférence du propriétaire (tout le monde /
-- amis = suivi mutuel).
create policy "profile_locations_select_allowed"
  on public.profile_locations for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = user_id and p.location_precision = 'exact_everyone'
    )
    or (
      exists (
        select 1 from public.profiles p
        where p.id = user_id and p.location_precision = 'exact_friends'
      )
      and exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid()) and f.following_id = user_id
      )
      and exists (
        select 1 from public.follows f
        where f.follower_id = user_id and f.following_id = (select auth.uid())
      )
    )
  );

create policy "profile_locations_insert_own"
  on public.profile_locations for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "profile_locations_update_own"
  on public.profile_locations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "profile_locations_delete_own"
  on public.profile_locations for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger profile_locations_touch
  before update on public.profile_locations
  for each row execute function public.touch_updated_at();

-- ===== 2. Groupes publics + photo ==========================================

alter table public.music_groups
  add column if not exists photo_url text,
  add column if not exists is_public boolean not null default false;

-- Groupes publics d'un profil (leader ou membre). SECURITY DEFINER : la
-- RLS des groupes reste « membres uniquement » pour tout le reste.
create or replace function public.profile_public_groups(target uuid)
returns table (
  id uuid,
  name text,
  emoji text,
  photo_url text,
  member_count bigint,
  is_leader boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id,
         g.name,
         g.emoji,
         g.photo_url,
         (select count(*) from public.group_members m
           where m.group_id = g.id and m.profile_id <> g.leader_id) + 1
           as member_count,
         (g.leader_id = target) as is_leader
    from public.music_groups g
   where g.is_public
     and (
       g.leader_id = target
       or exists (
         select 1 from public.group_members m
         where m.group_id = g.id and m.profile_id = target
       )
     )
$$;

revoke all on function public.profile_public_groups(uuid) from public, anon;
grant execute on function public.profile_public_groups(uuid) to authenticated;

-- ===== 3. Moyen de versement du cachet =====================================

alter table public.gig_requests
  add column if not exists payment_method text
    check (payment_method is null or char_length(payment_method) <= 40);

-- La vue feed expose le moyen de versement (visible aussi pendant
-- l'avant-première, comme le cachet — ça fait partie du teaser).
create or replace view public.gig_requests_feed
with (security_invoker = off) as
select
  g.id,
  g.host_id,
  case when public.can_see_full_gig(g) then g.title else null end as title,
  g.date,
  case when public.can_see_full_gig(g) then g.place else null end as place,
  case when public.can_see_full_gig(g) then g.neighborhood else null end as neighborhood,
  g.genre,
  g.wanted_instruments,
  g.fee,
  case when public.can_see_full_gig(g) then g.description else null end as description,
  g.posted_at,
  not public.can_see_full_gig(g) as is_locked,
  g.payment_method
from public.gig_requests g
where g.date > now();

-- ===== 4. Storage ==========================================================

-- Sans policy SELECT, l'API Storage ne « voit » pas l'objet existant :
-- l'upload upsert (remplacement d'avatar) retombe sur un INSERT qui viole
-- l'unicité → 409. Lecture limitée à son propre dossier : pas
-- d'énumération des fichiers des autres (les URLs publiques, elles,
-- passent par le CDN sans RLS).
create policy "avatars_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "demo_videos_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'demo-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Miniatures des vidéos de démo : le bucket accepte aussi le JPEG.
update storage.buckets
   set allowed_mime_types = array['video/mp4', 'video/quicktime', 'image/jpeg']
 where id = 'demo-videos';
