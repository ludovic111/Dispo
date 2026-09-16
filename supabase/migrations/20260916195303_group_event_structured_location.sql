-- Public locality must survive even when there is no private street address.
alter table public.group_events
  add column country_code text,
  add column city text,
  add column postal_code text;

update public.group_events e set country_code=l.country_code, city=l.city, postal_code=l.postal_code
from private.group_event_locations l where l.event_id=e.id
  and position(coalesce(l.postal_code,'') in coalesce(nullif(e.public_location_label,''),e.venue)) > 0
  and position(coalesce(l.city,'') in coalesce(nullif(e.public_location_label,''),e.venue)) > 0;
-- Recover only the exact, unambiguous CH/FR/DE/AT/IT numeric format written by the app.
with recovered as (
  select id, regexp_match(coalesce(nullif(public_location_label,''),venue),
    ' · ([0-9]{4,5}) ([^·]+) · (CH|FR|DE|AT|IT)$') parts from public.group_events
)
update public.group_events e set postal_code=coalesce(nullif(e.postal_code,''),r.parts[1]),
  city=coalesce(nullif(e.city,''),btrim(r.parts[2])), country_code=coalesce(e.country_code,r.parts[3])
from recovered r where r.id=e.id and r.parts is not null;

create function private.validate_group_event_locality()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if row(new.venue,new.public_location_label,new.country_code,new.city,new.postal_code)
      is not distinct from row(old.venue,old.public_location_label,old.country_code,old.city,old.postal_code) then
      return new;
    end if;
  end if;
  if coalesce(btrim(new.country_code),'') !~ '^[A-Z]{2}$'
    or length(coalesce(btrim(new.city),'')) not between 1 and 100
    or length(coalesce(btrim(new.postal_code),'')) not between 1 and 32 then
    raise exception 'group_event_location_required' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.validate_group_event_locality() from public, anon, authenticated;
create trigger group_event_locality_valid before insert or update on public.group_events
for each row execute function private.validate_group_event_locality();

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
        setlist, series_id, recurrence, reminder_lead_days, country_code, city, postal_code
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
        end,
        upper(btrim(v_item->>'country_code')), btrim(v_item->>'city'), btrim(v_item->>'postal_code')
      );
    else
      update public.group_events e
      set kind = btrim(v_item ->> 'kind'),
          title = btrim(v_item ->> 'title'),
          venue = v_label,
          public_location_label = v_label,
          date = (v_item ->> 'date')::timestamptz,
          country_code = case when v_item ? 'country_code' then upper(btrim(v_item->>'country_code')) else e.country_code end,
          city = case when v_item ? 'city' then btrim(v_item->>'city') else e.city end,
          postal_code = case when v_item ? 'postal_code' then btrim(v_item->>'postal_code') else e.postal_code end,
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
create or replace function public.set_group_event_location(
  p_event_id uuid,
  p_public_location_label text,
  p_exact_address text default null,
  p_postal_code text default null,
  p_city text default null,
  p_country_code text default 'CH',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_clear_exact_address boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_label text := left(btrim(coalesce(p_public_location_label, '')), 160);
  v_exact text := btrim(coalesce(p_exact_address, ''));
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.group_events e
    join public.music_groups g on g.id = e.group_id
    where e.id = p_event_id and g.leader_id = v_user
  ) then
    raise exception 'only_group_leader_can_set_event_location' using errcode = '42501';
  end if;
  if (coalesce(p_clear_exact_address, false) and v_exact <> '')
     or length(v_exact) > 600
     or (p_postal_code is not null and length(btrim(p_postal_code)) > 32)
     or (p_city is not null and length(btrim(p_city)) > 100)
     or upper(coalesce(p_country_code, 'CH')) !~ '^[A-Z]{2}$'
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180)
  then
    raise exception 'invalid_event_location' using errcode = '22023';
  end if;
  if v_label = '' and (
    v_exact <> ''
    or exists (
      select 1 from private.group_event_locations l
      where l.event_id = p_event_id
    )
  ) then
    v_label := 'Lieu communique apres confirmation';
  end if;

  if coalesce(p_clear_exact_address, false) or (v_exact <> '' and v_exact is distinct from (
    select l.exact_address from private.group_event_locations l where l.event_id=p_event_id
  )) then
    if exists (select 1 from public.group_events e where e.id=p_event_id and (
      nullif(btrim(coalesce(p_postal_code,e.postal_code)),'') is null
      or nullif(btrim(coalesce(p_city,e.city)),'') is null
      or coalesce(p_country_code,e.country_code,'') !~ '^[A-Z]{2}$'
    )) then
      raise exception 'group_event_location_required' using errcode='22023';
    end if;
  end if;

  perform set_config('dispo.location_rpc', 'on', true);

  -- NULL/vide signifie PRESERVER. L'effacement doit etre une intention
  -- distincte pour qu'un echec de chargement client ne devienne jamais une
  -- suppression silencieuse.
  if coalesce(p_clear_exact_address, false) then
    delete from private.group_event_locations where event_id = p_event_id;
  elsif v_exact <> '' then
    insert into private.group_event_locations(
      event_id, exact_address, postal_code, city, country_code,
      latitude, longitude, updated_at
    ) values (
      p_event_id, v_exact, nullif(btrim(p_postal_code), ''),
      nullif(btrim(p_city), ''), upper(coalesce(p_country_code, 'CH')),
      p_latitude, p_longitude, now()
    )
    on conflict (event_id) do update
      set exact_address = excluded.exact_address,
          postal_code = excluded.postal_code,
          city = excluded.city,
          country_code = excluded.country_code,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          updated_at = now();
  end if;

  -- Keep an existing private address while refreshing its structured locality.
  if not coalesce(p_clear_exact_address,false) and v_exact = '' then
    update private.group_event_locations set
      postal_code=coalesce(nullif(btrim(p_postal_code),''),postal_code),
      city=coalesce(nullif(btrim(p_city),''),city),
      country_code=case when nullif(btrim(p_city),'') is not null or nullif(btrim(p_postal_code),'') is not null
        then upper(p_country_code) else country_code end
    where event_id=p_event_id;
  end if;

  update public.group_events
  set public_location_label = v_label, venue = v_label,
      country_code = case when nullif(btrim(p_city),'') is not null or nullif(btrim(p_postal_code),'') is not null
        then upper(p_country_code) else country_code end,
      city = coalesce(nullif(btrim(p_city),''),city),
      postal_code = coalesce(nullif(btrim(p_postal_code),''),postal_code)
  where id = p_event_id;

  update public.gig_requests
  set public_location_label = v_label,
      place = v_label
  where event_id = p_event_id;

  -- L'evenement lie devient la source canonique uniquement lorsqu'une
  -- mutation privee explicite a eu lieu. En mode preserve, une ancienne
  -- adresse stockee sur le SOS reste disponible jusqu'a sa migration.
  if coalesce(p_clear_exact_address, false) or v_exact <> '' then
    delete from private.gig_request_locations gl
    using public.gig_requests g
    where g.id = gl.gig_id and g.event_id = p_event_id;
  end if;
end;
$$;

