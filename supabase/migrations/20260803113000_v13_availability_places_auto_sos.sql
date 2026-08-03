-- Dispo 1.3 — dispos ailleurs, et remplacement automatique.
--
-- 1. « Je suis dispo, mais à Lisbonne du 12 au 20 » : une liste de séjours
--    (période + lieu) posée sur le profil. Les dates cochées au calendrier
--    ne changent pas ; le lieu s'y superpose, et le fil peut filtrer dessus.
-- 2. Remplacement automatique : quand un membre se déclare indisponible,
--    le leader est prévenu tout de suite, et — s'il l'a activé — un SOS
--    part tout seul au niveau qu'il a choisi.

alter table public.profiles
  add column if not exists availability_places jsonb not null default '[]'::jsonb;

alter table public.music_groups
  add column if not exists auto_sos_enabled boolean not null default false,
  add column if not exists auto_sos_min_level text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'music_groups_auto_sos_level_check') then
    alter table public.music_groups
      add constraint music_groups_auto_sos_level_check
      check (
        auto_sos_min_level is null
        or auto_sos_min_level in ('Débutant', 'Intermédiaire', 'Avancé', 'Professionnel')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Le leader est prévenu dès qu'un membre se déclare indisponible
-- ---------------------------------------------------------------------------

create or replace function public.queue_unavailable_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group   uuid;
  v_leader  uuid;
  v_title   text;
  v_group_name text;
  v_member  text;
begin
  if new.status <> 'unavailable'
     or (tg_op = 'UPDATE' and old.status = 'unavailable') then
    return new;
  end if;

  select e.group_id, e.title into v_group, v_title
  from public.group_events e where e.id = new.event_id;
  if v_group is null then return new; end if;

  select g.leader_id, g.name into v_leader, v_group_name
  from public.music_groups g where g.id = v_group;
  -- Le leader qui se déclare lui-même indisponible n'a rien à s'apprendre.
  if v_leader is null or v_leader = new.profile_id then return new; end if;

  select coalesce(nullif(p.name, ''), 'Un musicien') into v_member
  from public.profiles p where p.id = new.profile_id;

  if exists (
    select 1 from public.push_devices d
    where d.user_id = v_leader and d.notifications_enabled and d.groups_enabled
  ) then
    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    values (
      v_leader, new.profile_id, 'groups',
      '⚠️ ' || v_group_name,
      v_member || ' ne peut pas venir à « ' || v_title || ' »',
      jsonb_build_object(
        'category', 'groups', 'target_tab', 'messages',
        'group_id', v_group::text, 'event_id', new.event_id::text
      ),
      -- Une notification par (événement, membre) : deux désistements sur le
      -- même concert doivent tous les deux remonter.
      'event_attendance', md5(new.event_id::text || new.profile_id::text)::uuid
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists event_attendance_queue_unavailable on public.event_attendance;
create trigger event_attendance_queue_unavailable
  after insert or update of status on public.event_attendance
  for each row execute function public.queue_unavailable_push();

revoke execute on function public.queue_unavailable_push() from public, anon, authenticated;
