-- Adhésion aux groupes : seul le leader ajoute des membres. L'ancien chemin
-- « or profile_id = auth.uid() » permettait de s'auto-inviter dans n'importe
-- quel groupe (lecture du répertoire, des événements et du roster, et même
-- modification des setlists via group_events_update_member). L'app ne
-- passait jamais par ce chemin ; le leader est ajouté par un trigger
-- SECURITY DEFINER, non concerné.
drop policy if exists "group_members_insert_leader_or_self" on public.group_members;
drop policy if exists "group_members_insert_leader" on public.group_members;
create policy "group_members_insert_leader"
  on public.group_members for insert to authenticated
  with check (public.is_group_leader(group_id));

-- Présence : un membre répond pour lui-même dans SES groupes uniquement ;
-- le leader peut répondre pour n'importe qui dans les siens. L'ancien
-- chemin « profile_id = auth.uid() » sans condition d'appartenance
-- permettait de s'incruster dans la présence d'un événement inconnu.
drop policy if exists "event_attendance_insert_self_or_leader" on public.event_attendance;
create policy "event_attendance_insert_self_or_leader"
  on public.event_attendance for insert to authenticated
  with check (
    exists (
      select 1 from public.group_events e
      where e.id = event_id
        and (
          public.is_group_leader(e.group_id)
          or (profile_id = (select auth.uid()) and public.is_group_member(e.group_id))
        )
    )
  );
