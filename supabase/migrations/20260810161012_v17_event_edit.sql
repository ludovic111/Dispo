-- Dispo 1.7 — modifier une date déjà créée.
--
-- Jusqu'ici un événement de groupe n'était pas modifiable : un leader qui se
-- trompait d'heure devait supprimer et recréer, ce qui effaçait toutes les
-- réponses de présence (CASCADE) et renvoyait une notification « nouvel
-- événement ». Cette migration ouvre l'édition proprement.
--
-- 1. Un garde-fou : la policy `group_events_update_member` autorise TOUT
--    membre à écrire (elle a été écrite pour les setlists). On ne peut pas
--    restreindre une policy à certaines colonnes, donc un trigger BEFORE
--    UPDATE refuse les changements de fond (date, titre, lieu, type, série)
--    à quelqu'un qui n'est pas le leader.
-- 2. Une notification, une seule : déplacer toute une série écrit N lignes,
--    et un trigger AFTER UPDATE enverrait N notifications — le « bug des
--    3000 notifs » du 05.08, à l'envers. L'app appelle donc une RPC une fois
--    l'écriture faite, qui envoie UN message en annonçant le nombre de dates.

-- ---------------------------------------------------------------------------
-- 1. Seul le leader change la date, le titre, le lieu ou le type
-- ---------------------------------------------------------------------------

create or replace function public.guard_group_event_core_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Écriture serveur (service role, triggers internes) : rien à contrôler.
  if v_uid is null then
    return new;
  end if;

  if new.date       is distinct from old.date
     or new.title   is distinct from old.title
     or new.venue   is distinct from old.venue
     or new.kind    is distinct from old.kind
     or new.series_id  is distinct from old.series_id
     or new.recurrence is distinct from old.recurrence
  then
    if not exists (
      select 1 from public.music_groups g
      where g.id = new.group_id and g.leader_id = v_uid
    ) then
      raise exception 'only_leader_can_edit_event'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_group_event_core_fields() from public, anon, authenticated;

drop trigger if exists group_events_guard_core on public.group_events;
create trigger group_events_guard_core
  before update on public.group_events
  for each row execute function public.guard_group_event_core_fields();

-- ---------------------------------------------------------------------------
-- 2. Prévenir le groupe une seule fois, quel que soit le nombre de dates
-- ---------------------------------------------------------------------------

create or replace function public.notify_group_event_moved(
  p_event_id uuid,
  p_dates integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_event  public.group_events%rowtype;
  v_leader uuid;
  v_body   text;
begin
  select * into v_event from public.group_events where id = p_event_id;
  if not found then
    return;
  end if;

  select g.leader_id into v_leader
  from public.music_groups g
  where g.id = v_event.group_id;

  -- Seul le leader annonce un déplacement — c'est lui qui vient de l'écrire.
  if v_uid is distinct from v_leader then
    raise exception 'only_leader_can_notify_move' using errcode = '42501';
  end if;

  v_body := left(
    v_event.title || case when v_event.venue <> '' then ' · ' || v_event.venue else '' end,
    120
  ) || ' · ' || to_char(v_event.date at time zone 'Europe/Zurich', 'DD.MM HH24:MI');

  if p_dates > 1 then
    v_body := v_body || ' · ' || p_dates || ' dates';
  end if;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    m.profile_id,
    v_leader,
    'groups',
    'Une date a changé',
    v_body,
    jsonb_build_object(
      'category', 'groups',
      'target_tab', 'messages',
      'group_id', v_event.group_id::text
    ),
    'group_events',
    v_event.id
  from public.group_members m
  where m.group_id = v_event.group_id
    and m.profile_id <> v_leader
    and exists (
      select 1 from public.push_devices d
      where d.user_id = m.profile_id and d.notifications_enabled and d.groups_enabled
    )
  on conflict do nothing;
end;
$$;

revoke all on function public.notify_group_event_moved(uuid, integer) from public, anon;
grant execute on function public.notify_group_event_moved(uuid, integer) to authenticated;
