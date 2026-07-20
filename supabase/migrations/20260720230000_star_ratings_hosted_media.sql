-- Notes étoilées anonymes (1–5) + médias de profil hébergés.
--
-- 1. `ratings` : une note par (auteur, noté). Le détail n'est lisible que
--    par son auteur (RLS) — l'anonymat est garanti par la base, pas par
--    l'UI. Le public ne voit que l'agrégat maintenu par trigger sur
--    `profiles` (rating_avg / rating_count), protégé contre l'auto-édition
--    comme is_premium.
-- 2. `profiles.demo_videos` : vidéos de démo hébergées (bucket public
--    `demo-videos`), limite 1 gratuite / 6 Premium appliquée par trigger.
-- 3. Buckets Storage `demo-videos` + `avatars` : lecture publique,
--    écriture limitée au dossier de l'utilisateur (<uid>/...).
-- Les tables `appreciations` et `favorites` restent en place pour ne pas
-- casser les builds 0.9.4 encore installés ; l'app ne les utilise plus.

-- ===== Agrégats + vidéos sur profiles ======================================

alter table public.profiles
  add column if not exists rating_avg numeric(3,2),
  add column if not exists rating_count integer not null default 0,
  add column if not exists demo_videos jsonb not null default '[]'::jsonb;

-- ===== Table ratings =======================================================

create table public.ratings (
  rater_id uuid not null references public.profiles (id) on delete cascade,
  rated_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (rater_id, rated_id),
  check (rater_id <> rated_id)
);

create index ratings_rated_id_idx on public.ratings (rated_id);

alter table public.ratings enable row level security;

create policy "ratings_select_own" on public.ratings
  for select to authenticated
  using (rater_id = (select auth.uid()));

create policy "ratings_insert_own" on public.ratings
  for insert to authenticated
  with check (rater_id = (select auth.uid()) and rated_id <> (select auth.uid()));

create policy "ratings_update_own" on public.ratings
  for update to authenticated
  using (rater_id = (select auth.uid()))
  with check (rater_id = (select auth.uid()) and rated_id <> (select auth.uid()));

create policy "ratings_delete_own" on public.ratings
  for delete to authenticated
  using (rater_id = (select auth.uid()));

create or replace function public.touch_rating()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ratings_touch
  before update on public.ratings
  for each row execute function public.touch_rating();

-- Maintien de la moyenne agrégée. SECURITY DEFINER : la RLS de profiles
-- n'autorise pas un client à écrire sur le profil d'un autre.
create or replace function public.refresh_profile_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.rated_id, old.rated_id);
begin
  update public.profiles p
     set rating_count = s.cnt,
         rating_avg = s.avg
    from (
      select count(*)::int as cnt,
             round(avg(stars)::numeric, 2) as avg
        from public.ratings
       where rated_id = target
    ) s
   where p.id = target;
  return coalesce(new, old);
end;
$$;

revoke all on function public.refresh_profile_rating() from public;

create trigger ratings_refresh_aggregate
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_profile_rating();

-- Comme is_premium / is_admin : l'agrégat n'est modifiable que par les
-- rôles serveur — une écriture client est silencieusement ignorée.
create or replace function public.protect_rating_aggregates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.rating_avg is distinct from old.rating_avg
      or new.rating_count is distinct from old.rating_count)
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_rating
  before update on public.profiles
  for each row execute function public.protect_rating_aggregates();

-- ===== Reprise des anciennes appréciations (note→4★, dorée→5★) ============

insert into public.ratings (rater_id, rated_id, stars)
select giver_id, receiver_id,
       case when kind = 'golden' then 5 else 4 end
  from public.appreciations
 where giver_id <> receiver_id
on conflict (rater_id, rated_id) do nothing;

update public.profiles p
   set rating_count = s.cnt,
       rating_avg = s.avg
  from (
    select rated_id,
           count(*)::int as cnt,
           round(avg(stars)::numeric, 2) as avg
      from public.ratings
     group by rated_id
  ) s
 where p.id = s.rated_id;

-- ===== Limite de vidéos selon l'abonnement =================================

create or replace function public.enforce_demo_video_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_count int;
  old_count int;
  allowed int;
begin
  if jsonb_typeof(new.demo_videos) is distinct from 'array' then
    raise exception 'demo_videos must be a JSON array';
  end if;
  if pg_column_size(new.demo_videos) > 8192 then
    raise exception 'demo_videos payload too large';
  end if;
  new_count := jsonb_array_length(new.demo_videos);
  old_count := coalesce(jsonb_array_length(old.demo_videos), 0);
  allowed := case when new.is_premium then 6 else 1 end;
  -- Seul l'ajout au-delà de la limite est bloqué : un profil redescendu en
  -- gratuit garde ses vidéos existantes mais ne peut plus en ajouter.
  if new_count > old_count and new_count > allowed then
    raise exception 'demo_video_limit';
  end if;
  return new;
end;
$$;

create trigger profiles_demo_video_limit
  before update of demo_videos on public.profiles
  for each row execute function public.enforce_demo_video_limit();

-- ===== Buckets Storage =====================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('demo-videos', 'demo-videos', true, 52428800, array['video/mp4', 'video/quicktime']),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Lecture publique (les profils sont publics) ; écriture uniquement dans
-- son propre dossier `<uid>/...`.
create policy "demo_videos_public_read" on storage.objects
  for select using (bucket_id = 'demo-videos');

create policy "demo_videos_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'demo-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "demo_videos_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'demo-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
