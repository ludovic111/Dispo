-- Dispo 1.3 — performance : les 13 derniers avertissements « auth_rls_initplan »
-- (en attente depuis le 18.07) et les 2 clés étrangères sans index.
--
-- `auth.uid()` écrit tel quel dans une policy est réévalué POUR CHAQUE LIGNE.
-- Enveloppé dans `(select auth.uid())`, Postgres le calcule une fois par
-- requête. Sémantique identique — seules les performances changent, et
-- seulement à l'échelle. Les policies sont recréées à l'identique par
-- ailleurs (mêmes rôles `authenticated`, mêmes conditions).

-- profiles
alter policy "profiles_insert_own" on public.profiles
  with check (id = (select auth.uid()));
alter policy "profiles_update_own" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- gig_requests
alter policy "gigs_insert_own" on public.gig_requests
  with check (host_id = (select auth.uid()));
alter policy "gigs_update_own" on public.gig_requests
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));
alter policy "gigs_delete_own" on public.gig_requests
  using (host_id = (select auth.uid()));

-- gig_applications
alter policy "applications_select_involved" on public.gig_applications
  using (
    musician_id = (select auth.uid())
    or exists (
      select 1 from public.gig_requests g
      where g.id = gig_applications.gig_id and g.host_id = (select auth.uid())
    )
  );
alter policy "applications_insert_own" on public.gig_applications
  with check (
    musician_id = (select auth.uid())
    and exists (
      select 1 from public.gig_requests g
      where g.id = gig_applications.gig_id and public.can_see_full_gig(g.*)
    )
  );
alter policy "applications_delete_own" on public.gig_applications
  using (musician_id = (select auth.uid()));

-- conversations
alter policy "conversations_insert_own" on public.conversations
  with check (
    participant_a = (select auth.uid()) or participant_b = (select auth.uid())
  );

-- music_groups
alter policy "music_groups_insert_premium" on public.music_groups
  with check (
    leader_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.is_premium = true
    )
  );

-- group_members
alter policy "group_members_delete_leader_or_self" on public.group_members
  using (
    public.is_group_leader(group_id) or profile_id = (select auth.uid())
  );

-- event_attendance
alter policy "event_attendance_update_self_or_leader" on public.event_attendance
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.group_events e
      where e.id = event_attendance.event_id and public.is_group_leader(e.group_id)
    )
  )
  with check (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.group_events e
      where e.id = event_attendance.event_id and public.is_group_leader(e.group_id)
    )
  );
alter policy "event_attendance_delete_self_or_leader" on public.event_attendance
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.group_events e
      where e.id = event_attendance.event_id and public.is_group_leader(e.group_id)
    )
  );

-- Clés étrangères sans index couvrant : « mes SOS » et « mes messages
-- envoyés » balayaient la table entière.
create index if not exists gig_requests_host_idx on public.gig_requests (host_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
