-- Dispo — schéma initial (Phase 2)
-- Profils musiciens, annonces SOS dépannage, candidatures, messagerie,
-- appréciations positives et favoris. RLS partout : l'avant-première
-- Premium (30 min) est appliquée côté serveur, pas seulement dans l'app.

-- ===========================================================================
-- Droits d'accès — la sécurité fine est assurée par les policies RLS.
-- ===========================================================================

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- ===========================================================================
-- Profils (1:1 avec auth.users)
-- ===========================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  age int check (age is null or age between 13 and 120),
  neighborhood text not null default '',
  latitude double precision,
  longitude double precision,
  -- rawValues français des enums Swift (Instrument, Genre, Level, Availability)
  instruments text[] not null default '{}',
  genres text[] not null default '{}',
  level text not null default 'Intermédiaire'
    check (level in ('Débutant', 'Intermédiaire', 'Avancé', 'Professionnel')),
  bio text not null default '',
  availability text not null default 'Sur demande'
    check (availability in ('Ce soir', 'Cette semaine', 'Ce week-end', 'Sur demande', 'Indisponible')),
  repertoire text[] not null default '{}',
  photo_url text,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_all_authenticated"
  on public.profiles for select to authenticated using (true);

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Création automatique du profil à l'inscription.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automatique.
create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Annonces SOS dépannage
-- ===========================================================================

create table public.gig_requests (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  date timestamptz not null,
  place text not null default '',
  neighborhood text not null default '',
  genre text not null,
  wanted_instruments text[] not null default '{}',
  fee int check (fee is null or fee >= 0),
  description text not null default '',
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index gig_requests_date_idx on public.gig_requests (date);

alter table public.gig_requests enable row level security;

-- L'avant-première Premium est appliquée ici : pendant les 30 premières
-- minutes, seuls l'hôte et les membres Premium voient l'annonce complète.
-- Les non-Premium la découvrent via la vue teaser ci-dessous.
create function public.can_see_full_gig(gig public.gig_requests)
returns boolean
language sql stable security definer set search_path = public
as $$
  select gig.host_id = auth.uid()
      or gig.posted_at + interval '30 minutes' <= now()
      or coalesce((select is_premium from public.profiles where id = auth.uid()), false)
$$;

create policy "gigs_select_after_early_access"
  on public.gig_requests for select to authenticated
  using (public.can_see_full_gig(gig_requests));

create policy "gigs_insert_own"
  on public.gig_requests for insert to authenticated with check (host_id = auth.uid());

create policy "gigs_update_own"
  on public.gig_requests for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "gigs_delete_own"
  on public.gig_requests for delete to authenticated using (host_id = auth.uid());

-- Vue teaser : pendant l'avant-première, les non-Premium voient le cachet,
-- l'instrument et le genre — mais ni le titre, ni le lieu, ni la description.
create view public.gig_requests_feed
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
  not public.can_see_full_gig(g) as is_locked
from public.gig_requests g
where g.date > now();

grant select on public.gig_requests_feed to authenticated;

-- ===========================================================================
-- Candidatures (« Je peux dépanner ! »)
-- ===========================================================================

create table public.gig_applications (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gig_requests (id) on delete cascade,
  musician_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now(),
  unique (gig_id, musician_id)
);

alter table public.gig_applications enable row level security;

create policy "applications_select_involved"
  on public.gig_applications for select to authenticated
  using (
    musician_id = auth.uid()
    or exists (select 1 from public.gig_requests g where g.id = gig_id and g.host_id = auth.uid())
  );

-- Postuler exige de voir l'annonce complète (donc respecte l'avant-première).
create policy "applications_insert_own"
  on public.gig_applications for insert to authenticated
  with check (
    musician_id = auth.uid()
    and exists (
      select 1 from public.gig_requests g
      where g.id = gig_id and public.can_see_full_gig(g)
    )
  );

create policy "applications_delete_own"
  on public.gig_applications for delete to authenticated using (musician_id = auth.uid());

-- ===========================================================================
-- Messagerie
-- ===========================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Paire ordonnée pour garantir l'unicité (a < b).
  participant_a uuid not null references public.profiles (id) on delete cascade,
  participant_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (participant_a < participant_b),
  unique (participant_a, participant_b)
);

alter table public.conversations enable row level security;

create policy "conversations_select_own"
  on public.conversations for select to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

create policy "conversations_insert_own"
  on public.conversations for insert to authenticated
  with check (participant_a = auth.uid() or participant_b = auth.uid());

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (length(text) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create function public.is_conversation_member(conv_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv_id and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
  )
$$;

create policy "messages_select_member"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "messages_insert_member"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Temps réel sur les messages (et les nouvelles annonces SOS).
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.gig_requests;

-- ===========================================================================
-- Appréciations positives (note de musique / note dorée) & favoris
-- ===========================================================================

create table public.appreciations (
  id uuid primary key default gen_random_uuid(),
  giver_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('note', 'golden')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  check (giver_id <> receiver_id),
  unique (giver_id, receiver_id)
);

alter table public.appreciations enable row level security;

create policy "appreciations_select_all"
  on public.appreciations for select to authenticated using (true);

create policy "appreciations_upsert_own"
  on public.appreciations for insert to authenticated with check (giver_id = auth.uid());

create policy "appreciations_update_own"
  on public.appreciations for update to authenticated
  using (giver_id = auth.uid()) with check (giver_id = auth.uid());

create policy "appreciations_delete_own"
  on public.appreciations for delete to authenticated using (giver_id = auth.uid());

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  favorite_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_id)
);

alter table public.favorites enable row level security;

create policy "favorites_all_own"
  on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
