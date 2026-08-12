-- Dispo 1.8 — annuler une session de groupe et prévenir les membres.
--
-- Jusqu'ici l'app supprimait directement `group_events`. La date disparaissait
-- bien, mais personne d'autre ne savait pourquoi. Cette RPC garde l'opération
-- atomique : contrôle leader, une notification de groupe, puis suppression de
-- la date (ou de toutes les occurrences futures choisies par l'app).

create or replace function public.cancel_group_events(p_event_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_event     public.group_events%rowtype;
  v_leader    uuid;
  v_count     integer;
  v_body      text;
begin
  if v_uid is null or coalesce(cardinality(p_event_ids), 0) = 0 then
    raise exception 'invalid_event_cancellation' using errcode = '22023';
  end if;

  -- L'ancre donne le groupe et le texte de la notification. Le verrou évite
  -- qu'une autre opération supprime la même date pendant la transaction.
  select e.* into v_event
  from public.group_events e
  where e.id = p_event_ids[1]
  for update;

  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  select g.leader_id into v_leader
  from public.music_groups g
  where g.id = v_event.group_id;

  if v_uid is distinct from v_leader then
    raise exception 'only_leader_can_cancel_event' using errcode = '42501';
  end if;

  -- Refuse un tableau qui mélangerait plusieurs groupes, contiendrait un ID
  -- inconnu ou le même ID plusieurs fois. L'appel reste tout ou rien.
  select count(*)::integer into v_count
  from public.group_events e
  where e.id = any(p_event_ids)
    and e.group_id = v_event.group_id;

  if v_count <> cardinality(p_event_ids) then
    raise exception 'invalid_event_cancellation_scope' using errcode = '22023';
  end if;

  v_body := left(
    v_event.title
      || case when v_event.venue <> '' then ' · ' || v_event.venue else '' end
      || ' · ' || to_char(v_event.date at time zone 'Europe/Zurich', 'DD.MM HH24:MI'),
    180
  );
  if v_count > 1 then
    v_body := left(v_body || ' · ' || v_count || ' dates', 180);
  end if;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    m.profile_id,
    v_leader,
    'groups',
    case when v_count > 1 then 'Sessions annulées' else 'Session annulée' end,
    v_body,
    jsonb_build_object(
      'category', 'groups',
      'target_tab', 'messages',
      'group_id', v_event.group_id::text
    ),
    'group_event_cancellations',
    v_event.id
  from public.group_members m
  where m.group_id = v_event.group_id
    and m.profile_id <> v_leader
    and exists (
      select 1 from public.push_devices d
      where d.user_id = m.profile_id
        and d.notifications_enabled
        and d.groups_enabled
    )
  on conflict do nothing;

  delete from public.group_events e
  where e.id = any(p_event_ids)
    and e.group_id = v_event.group_id;

  return v_count;
end;
$$;

revoke all on function public.cancel_group_events(uuid[]) from public, anon;
grant execute on function public.cancel_group_events(uuid[]) to authenticated;
