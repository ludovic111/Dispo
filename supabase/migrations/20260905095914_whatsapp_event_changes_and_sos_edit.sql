-- Schéma généré avec supabase db pull --local, limité au lot WhatsApp.
-- Les écarts de privilèges préexistants de la base locale sont exclus.
-- Retours WhatsApp du 05.09 : écoles recherchées, édition SOS atomique,
-- témoin partagé des changements de date/heure/lieu. Aucun backfill métier.
alter table public.gig_requests
  add column wanted_school_ids uuid[] not null default '{}';
alter table public.group_events
  add column schedule_changed_at timestamptz;

create function private.mark_group_event_schedule_changed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 and new.schedule_changed_at is distinct from old.schedule_changed_at then
    return new;
  end if;
  if row(new.date, new.venue, new.public_location_label)
     is distinct from row(old.date, old.venue, old.public_location_label) then
    new.schedule_changed_at := clock_timestamp();
  else
    new.schedule_changed_at := old.schedule_changed_at;
  end if;
  return new;
end;
$$;
revoke all on function private.mark_group_event_schedule_changed() from public, anon, authenticated;
create trigger group_event_schedule_changed before update on public.group_events
for each row execute function private.mark_group_event_schedule_changed();

create function private.validate_gig_wanted_schools()
returns trigger language plpgsql set search_path = '' as $$
begin
  if cardinality(new.wanted_school_ids) > 50 or exists (
    select 1 from unnest(new.wanted_school_ids) wanted(school_id)
    where wanted.school_id is null or not exists (
      select 1 from public.music_schools s where s.id = wanted.school_id and s.is_active
    )
  ) then
    raise exception 'invalid_gig_school' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_gig_wanted_schools() from public, anon, authenticated;
create trigger gig_wanted_schools_valid before insert or update of wanted_school_ids on public.gig_requests
for each row execute function private.validate_gig_wanted_schools();

-- Invoker : conserve les RLS existantes, contrôle l'hôte et ne touche ni aux
-- candidatures ni aux champs de liaison/acceptation. La localisation d'un SOS
-- lié continue d'appartenir à son événement et se modifie dans cet événement.
create function public.update_gig_request(p_gig_id uuid, p_changes jsonb, p_location jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_current public.gig_requests;
  v_instruments text[];
  v_schools uuid[];
  v_date timestamptz := (p_changes->>'date')::timestamptz;
begin
  select * into v_current from public.gig_requests
  where id = p_gig_id and host_id = (select auth.uid()) for update;
  if not found then
    raise exception 'only_gig_host_can_edit' using errcode = '42501';
  end if;
  v_instruments := array(select jsonb_array_elements_text(p_changes->'wanted_instruments'));
  v_schools := array(select jsonb_array_elements_text(coalesce(nullif(p_changes->'wanted_school_ids', 'null'), '[]'))::uuid);
  if length(btrim(coalesce(p_changes->>'title', ''))) not between 1 and 120
    or length(coalesce(p_changes->>'description', '')) > 2000
    or nullif(btrim(p_changes->>'genre'), '') is null
    or cardinality(v_instruments) = 0
    or v_date is null or v_date <= now()
    or (p_changes->>'fee')::integer < 0 then
    raise exception 'invalid_gig_edit' using errcode = '22023';
  end if;
  if not coalesce(v_current.filled_instruments, '{}') <@ v_instruments then
    raise exception 'accepted_instrument_cannot_be_removed' using errcode = '22023';
  end if;
  update public.gig_requests set
    title = btrim(p_changes->>'title'),
    date = case when v_current.event_id is null then v_date else v_current.date end,
    genre = btrim(p_changes->>'genre'),
    description = btrim(coalesce(p_changes->>'description', '')),
    fee = (p_changes->>'fee')::integer,
    payment_method = nullif(btrim(p_changes->>'payment_method'), ''),
    wanted_instruments = v_instruments,
    wanted_levels = array(select jsonb_array_elements_text(coalesce(nullif(p_changes->'wanted_levels', 'null'), '[]'))),
    wanted_school_ids = v_schools,
    neighborhood = case when v_current.event_id is null then p_changes->>'neighborhood' else v_current.neighborhood end,
    place = case when v_current.event_id is null then p_changes->>'place' else v_current.place end,
    public_location_label = case when v_current.event_id is null then p_changes->>'public_location_label' else v_current.public_location_label end
  where id = p_gig_id and host_id = (select auth.uid());
  if v_current.event_id is null then
    perform public.set_gig_request_location(
      p_gig_id, p_location->>'publicLocationLabel',
      nullif(p_location->>'exactAddress', ''), p_location->>'postalCode',
      p_location->>'city', p_location->>'countryCode',
      (p_location->>'latitude')::double precision,
      (p_location->>'longitude')::double precision,
      coalesce((p_location->>'clearExactAddress')::boolean, false)
    );
  end if;
end;
$$;
revoke all on function public.update_gig_request(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_gig_request(uuid, jsonb, jsonb) to authenticated;

create or replace view public.gig_requests_feed
with (security_invoker = true)
as
 select g.id,
        g.host_id,
        case when public.can_see_full_gig(g.*) then g.title else null::text end as title,
        g.date,
        case when public.can_see_full_gig(g.*)
          then coalesce(nullif(g.public_location_label, ''), g.place)
          else null::text end as place,
        case when public.can_see_full_gig(g.*) then g.neighborhood else null::text end as neighborhood,
        g.genre,
        g.wanted_instruments,
        case when public.viewer_is_pro() then g.fee else null::integer end as fee,
        case when public.can_see_full_gig(g.*) then g.description else null::text end as description,
        g.posted_at,
        not public.can_see_full_gig(g.*) as is_locked,
        case when public.viewer_is_pro() then g.payment_method else null::text end as payment_method,
        g.filled_instruments,
        g.group_id,
        g.event_id,
        g.target_id,
        g.target_status,
        g.wanted_levels,
        case when public.can_see_full_gig(g.*)
          then coalesce(nullif(g.public_location_label, ''), g.place)
          else null::text end as public_location_label,
        g.wanted_school_ids
   from public.gig_requests g
  where g.date > now()
    and (
        g.target_id is null
        or g.target_id = (select auth.uid())
        or g.host_id = (select auth.uid())
    )
    and (
        g.host_id = (select auth.uid())
        or g.target_id = (select auth.uid())
        or coalesce(array_length(g.wanted_instruments, 1), 0) = 0
        or not (g.wanted_instruments <@ coalesce(g.filled_instruments, '{}'::text[]))
        or exists (
            select 1
              from public.gig_applications a
             where a.gig_id = g.id
               and a.musician_id = (select auth.uid())
        )
    );

grant select on public.gig_requests_feed to authenticated;


-- Les notifications compatibles respectent les écoles recherchées.
create or replace function public.queue_gig_push()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  host_name text;
begin
  if new.target_id is not null then
    select coalesce(nullif(p.name, ''), 'Un musicien') into host_name
    from public.profiles p where p.id = new.host_id;

    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    select
      new.target_id, new.host_id, 'sos', 'Demande de dépannage',
      left(host_name || ' te demande de dépanner : ' || new.title, 180),
      jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
      'gig_requests', new.id
    where exists (
        select 1 from public.push_devices d
        where d.user_id = new.target_id and d.notifications_enabled and d.sos_enabled
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = new.target_id and b.blocked_id = new.host_id)
           or (b.blocker_id = new.host_id and b.blocked_id = new.target_id)
      )
    on conflict do nothing;
    return new;
  end if;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    p.id,
    new.host_id,
    'sos',
    'Nouveau SOS compatible',
    left(new.title || case when new.place <> '' then ' · ' || new.place else '' end, 180),
    jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
    'gig_requests',
    new.id
  from public.profiles p
  where p.id <> new.host_id
    and exists (
      select 1 from unnest(p.available_dates) as dispo(day)
      where dispo.day >= current_date
    )
    and (cardinality(new.wanted_school_ids) = 0 or exists (
      select 1 from public.music_school_memberships m
      join public.music_schools s on s.id = m.school_id and s.is_active
      where m.profile_id = p.id and m.status = 'active' and m.left_at is null
        and m.school_id = any(new.wanted_school_ids)
    ))
    and p.instruments && new.wanted_instruments
    -- Le niveau demandé, s'il y en a un : niveau global OU niveau déclaré
    -- sur l'un des instruments recherchés.
    and (
      new.wanted_levels is null
      or cardinality(new.wanted_levels) = 0
      or p.level = any(new.wanted_levels)
      or exists (
        select 1
          from jsonb_each_text(coalesce(p.instrument_levels, '{}'::jsonb)) as il(inst, lvl)
         where il.inst = any(new.wanted_instruments)
           and il.lvl = any(new.wanted_levels)
      )
    )
    and exists (
      select 1 from public.push_devices d
      where d.user_id = p.id and d.notifications_enabled and d.sos_enabled
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p.id and b.blocked_id = new.host_id)
         or (b.blocker_id = new.host_id and b.blocked_id = p.id)
    )
  on conflict do nothing;
  return new;
end;
$function$;

-- Une modification de l'adresse privée signale le changement sans exposer sa valeur.
create function private.mark_event_private_location_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
begin
  if tg_op = 'UPDATE' and row(new.exact_address, new.postal_code, new.city, new.country_code, new.latitude, new.longitude)
    is not distinct from row(old.exact_address, old.postal_code, old.city, old.country_code, old.latitude, old.longitude) then
    return new;
  end if;
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  update public.group_events set schedule_changed_at = clock_timestamp()
  where id = v_event_id and created_at < transaction_timestamp();
  return coalesce(new, old);
end;
$$;
revoke all on function private.mark_event_private_location_changed() from public, anon, authenticated;
create trigger event_private_location_changed after insert or update or delete on private.group_event_locations
for each row execute function private.mark_event_private_location_changed();
