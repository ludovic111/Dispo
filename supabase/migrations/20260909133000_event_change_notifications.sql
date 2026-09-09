-- One notification per new place/day/time revision, including repeated edits.
-- Private bookkeeping prevents retries and title-only saves from notifying again.
create table private.group_event_notified_revisions (
  event_id uuid primary key references public.group_events(id) on delete cascade,
  changed_at timestamptz not null
);
alter table private.group_event_notified_revisions enable row level security;
revoke all on private.group_event_notified_revisions from public, anon, authenticated;
insert into private.group_event_notified_revisions (event_id, changed_at)
select id, schedule_changed_at from public.group_events where schedule_changed_at is not null;

create or replace function public.notify_group_event_moved(p_event_id uuid, p_dates integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_event public.group_events%rowtype;
  v_changed public.group_events%rowtype;
  v_leader uuid;
  v_count integer := 0;
  v_notification_id uuid := gen_random_uuid();
  v_body text;
begin
  select * into v_event from public.group_events where id = p_event_id;
  if not found then return; end if;
  -- Serialize announcements for the group, also covering a series update.
  select leader_id into v_leader from public.music_groups
    where id = v_event.group_id for update;
  if v_uid is distinct from v_leader then
    raise exception 'only_leader_can_notify_move' using errcode = '42501';
  end if;
  for v_changed in
    select e.* from public.group_events e
    left join private.group_event_notified_revisions r on r.event_id = e.id
    where e.group_id = v_event.group_id
      and (e.id = p_event_id or (p_dates > 1 and v_event.series_id is not null
        and e.series_id = v_event.series_id and e.date > now()))
      and e.schedule_changed_at > coalesce(r.changed_at, e.created_at)
    order by e.date, e.id
  loop
    insert into private.group_event_notified_revisions(event_id, changed_at)
    values (v_changed.id, v_changed.schedule_changed_at)
    on conflict(event_id) do update set changed_at = excluded.changed_at;
    v_count := v_count + 1;
    if v_count = 1 then v_event := v_changed; end if;
  end loop;
  if v_count = 0 then return; end if;
  v_body := left(v_event.title || case when v_event.public_location_label <> ''
    then ' · ' || v_event.public_location_label else '' end, 120)
    || ' · ' || to_char(v_event.date at time zone 'Europe/Zurich', 'DD.MM HH24:MI');
  if v_count > 1 then v_body := v_body || ' · ' || v_count || ' dates'; end if;
  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select m.profile_id, v_leader, 'groups', 'Une date a changé', v_body,
    jsonb_build_object('category','groups','target_tab','sessions',
      'group_id',v_event.group_id::text,'event_id',v_event.id::text,
      'schedule_changed_at',v_event.schedule_changed_at::text),
    'group_event_changes', v_notification_id
  from public.group_members m
  where m.group_id = v_event.group_id and m.profile_id <> v_leader
  on conflict do nothing;
end;
$$;
revoke all on function public.notify_group_event_moved(uuid, integer) from public, anon;
grant execute on function public.notify_group_event_moved(uuid, integer) to authenticated;

create or replace function public.save_group_events_with_locations(
  p_group_id uuid,
  p_events jsonb,
  p_mode text default 'update'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_leader uuid;
  v_item jsonb;
  v_event_id uuid;
  v_label text;
  v_exact text;
  v_clear boolean;
  v_clear_reminder boolean;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_mode not in ('create', 'update') then
    raise exception 'invalid_group_event_save_mode' using errcode = '22023';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array'
     or jsonb_array_length(p_events) not between 1 and 60
  then
    raise exception 'invalid_group_event_batch' using errcode = '22023';
  end if;

  select g.leader_id into v_leader
  from public.music_groups g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group_not_found' using errcode = '22023';
  end if;
  if v_leader <> v_user then
    raise exception 'only_group_leader_can_save_events' using errcode = '42501';
  end if;

  if (
    select count(*) <> count(distinct (item ->> 'id'))
    from jsonb_array_elements(p_events) item
  ) then
    raise exception 'duplicate_group_event_id' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_events)
  loop
    begin
      v_event_id := nullif(v_item ->> 'id', '')::uuid;
      v_label := left(btrim(coalesce(v_item ->> 'public_location_label', '')), 160);
      v_exact := btrim(coalesce(v_item ->> 'exact_address', ''));
      v_clear := coalesce((v_item ->> 'clear_exact_address')::boolean, false);
      v_clear_reminder := coalesce((v_item ->> 'clear_reminder')::boolean, false);
    exception when others then
      raise exception 'invalid_group_event_payload' using errcode = '22023';
    end;

    if v_event_id is null
       or nullif(btrim(v_item ->> 'kind'), '') is null
       or nullif(btrim(v_item ->> 'title'), '') is null
       or nullif(v_item ->> 'date', '') is null
       or (v_clear and v_exact <> '')
       or (v_clear_reminder and nullif(v_item ->> 'reminder_lead_days', '') is not null)
    then
      raise exception 'invalid_group_event_payload' using errcode = '22023';
    end if;

    if p_mode = 'create' then
      insert into public.group_events(
        id, group_id, kind, title, venue, public_location_label, date,
        setlist, series_id, recurrence, reminder_lead_days
      ) values (
        v_event_id,
        p_group_id,
        btrim(v_item ->> 'kind'),
        btrim(v_item ->> 'title'),
        v_label,
        v_label,
        (v_item ->> 'date')::timestamptz,
        coalesce(v_item -> 'setlist', '[]'::jsonb),
        nullif(v_item ->> 'series_id', '')::uuid,
        nullif(v_item ->> 'recurrence', ''),
        case
          when v_clear_reminder then null
          else nullif(v_item ->> 'reminder_lead_days', '')::integer
        end
      );
    else
      update public.group_events e
      set kind = btrim(v_item ->> 'kind'),
          title = btrim(v_item ->> 'title'),
          venue = v_label,
          public_location_label = v_label,
          date = (v_item ->> 'date')::timestamptz,
          reminder_lead_days = case
            when v_clear_reminder then null
            when v_item ? 'reminder_lead_days'
              then nullif(v_item ->> 'reminder_lead_days', '')::integer
            else e.reminder_lead_days
          end
      where e.id = v_event_id and e.group_id = p_group_id;
      if not found then
        raise exception 'group_event_not_found' using errcode = '22023';
      end if;
    end if;

    perform public.set_group_event_location(
      v_event_id,
      v_label,
      nullif(v_exact, ''),
      nullif(v_item ->> 'postal_code', ''),
      nullif(v_item ->> 'city', ''),
      coalesce(nullif(v_item ->> 'country_code', ''), 'CH'),
      nullif(v_item ->> 'latitude', '')::double precision,
      nullif(v_item ->> 'longitude', '')::double precision,
      v_clear
    );
  end loop;
  -- Announce inside the save transaction; a disconnected client cannot lose the notification.
  if p_mode = 'update' then
    perform public.notify_group_event_moved((p_events -> 0 ->> 'id')::uuid, jsonb_array_length(p_events));
  end if;
end;
$$;

revoke all on function public.save_group_events_with_locations(uuid, jsonb, text)
  from public, anon;
grant execute on function public.save_group_events_with_locations(uuid, jsonb, text)
  to authenticated;
