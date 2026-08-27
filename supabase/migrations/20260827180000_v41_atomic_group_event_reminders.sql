-- Dispo 2.4 / v41 — le rappel rejoint l'edition atomique event + adresse.
--
-- v37 persistait reminder_lead_days pendant la creation, mais sa branche
-- UPDATE l'ignorait. Les clients devaient donc envoyer un second UPDATE qui
-- pouvait reussir ou echouer independamment du reste de la session. Cette
-- version conserve le contrat v37 et ajoute une intention explicite de clear.

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
end;
$$;

revoke all on function public.save_group_events_with_locations(uuid, jsonb, text)
  from public, anon;
grant execute on function public.save_group_events_with_locations(uuid, jsonb, text)
  to authenticated;
