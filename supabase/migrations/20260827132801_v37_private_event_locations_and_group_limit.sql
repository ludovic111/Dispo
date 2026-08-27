-- Dispo 2.4 / v37 — adresses exactes hors Data API + premier groupe gratuit.
--
-- `place` et `venue` restent des libelles publics pour les anciens DTO.
-- L'adresse precise n'existe que dans `private` et n'est retournee que par
-- des RPC qui reverifient l'organisateur ou la participation acceptee.

alter table public.gig_requests
  add column if not exists public_location_label text not null default '';
alter table public.group_events
  add column if not exists public_location_label text not null default '';

alter table public.gig_requests
  drop constraint if exists gig_requests_public_location_label_check;
alter table public.gig_requests
  add constraint gig_requests_public_location_label_check
  check (length(public_location_label) <= 160);

alter table public.group_events
  drop constraint if exists group_events_public_location_label_check;
alter table public.group_events
  add constraint group_events_public_location_label_check
  check (length(public_location_label) <= 160);

comment on column public.gig_requests.public_location_label is
  'Libelle public non sensible (ville, quartier ou nom de salle sans adresse).';
comment on column public.group_events.public_location_label is
  'Libelle public non sensible. L adresse exacte est dans private.group_event_locations.';

create table private.gig_request_locations (
  gig_id uuid primary key
    references public.gig_requests(id) on delete cascade
    deferrable initially deferred,
  exact_address text not null check (length(btrim(exact_address)) between 1 and 600),
  postal_code text check (postal_code is null or length(btrim(postal_code)) <= 32),
  city text check (city is null or length(btrim(city)) <= 100),
  country_code text not null default 'CH' check (country_code ~ '^[A-Z]{2}$'),
  latitude double precision,
  longitude double precision,
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create table private.group_event_locations (
  event_id uuid primary key
    references public.group_events(id) on delete cascade
    deferrable initially deferred,
  exact_address text not null check (length(btrim(exact_address)) between 1 and 600),
  postal_code text check (postal_code is null or length(btrim(postal_code)) <= 32),
  city text check (city is null or length(btrim(city)) <= 100),
  country_code text not null default 'CH' check (country_code ~ '^[A-Z]{2}$'),
  latitude double precision,
  longitude double precision,
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

alter table private.gig_request_locations enable row level security;
alter table private.group_event_locations enable row level security;
revoke all on table private.gig_request_locations
  from public, anon, authenticated;
revoke all on table private.group_event_locations
  from public, anon, authenticated;

-- Backfill conservateur : toute ancienne chaine de lieu est traitee comme
-- potentiellement exacte. Pour un SOS lie, l'evenement est la source canonique.
insert into private.group_event_locations(event_id, exact_address)
select e.id, left(
  coalesce(nullif(btrim(e.venue), ''), nullif(btrim(linked.place), '')),
  600
)
from public.group_events e
left join lateral (
  select g.place
  from public.gig_requests g
  where g.event_id = e.id and btrim(g.place) <> ''
  order by g.created_at, g.id
  limit 1
) linked on true
where coalesce(nullif(btrim(e.venue), ''), nullif(btrim(linked.place), '')) is not null
on conflict (event_id) do nothing;

insert into private.gig_request_locations(gig_id, exact_address)
select g.id, left(btrim(g.place), 600)
from public.gig_requests g
where g.event_id is null and btrim(g.place) <> ''
on conflict (gig_id) do nothing;

-- Les anciennes valeurs sont preservees ci-dessus puis retirees des lignes
-- publiees. Les triggers v26 synchronisent naturellement le libelle public
-- des evenements vers leurs SOS lies, sans toucher aux UUID/setlists.
update public.group_events e
set public_location_label = case
      when btrim(e.venue) = '' then ''
      else 'Lieu communique apres confirmation'
    end,
    venue = case
      when btrim(e.venue) = '' then ''
      else 'Lieu communique apres confirmation'
    end;

update public.gig_requests g
set public_location_label = case
      when g.event_id is not null then coalesce(e.public_location_label, '')
      when btrim(g.place) = '' then ''
      when btrim(g.neighborhood) <> '' then left(btrim(g.neighborhood), 160)
      else 'Lieu communique apres confirmation'
    end,
    place = case
      when g.event_id is not null then coalesce(e.public_location_label, '')
      when btrim(g.place) = '' then ''
      when btrim(g.neighborhood) <> '' then left(btrim(g.neighborhood), 160)
      else 'Lieu communique apres confirmation'
    end
from public.group_events e
where g.event_id = e.id;

update public.gig_requests g
set public_location_label = case
      when btrim(g.place) = '' then ''
      when btrim(g.neighborhood) <> '' then left(btrim(g.neighborhood), 160)
      else 'Lieu communique apres confirmation'
    end,
    place = case
      when btrim(g.place) = '' then ''
      when btrim(g.neighborhood) <> '' then left(btrim(g.neighborhood), 160)
      else 'Lieu communique apres confirmation'
    end
where g.event_id is null;

-- Les APNs deja livres ne sont pas retractables, mais le centre de
-- notifications en base ne doit pas conserver une ancienne adresse exacte.
update public.push_notifications pn
set body = left(
  g.title
    || case
      when coalesce(nullif(g.public_location_label, ''), g.place) <> ''
        then ' · ' || coalesce(nullif(g.public_location_label, ''), g.place)
      else ''
    end,
  180
)
from public.gig_requests g
where pn.source_table = 'gig_requests' and pn.source_id = g.id;

update public.push_notifications pn
set body = left(
  e.title || ' · '
    || to_char(e.date at time zone 'Europe/Zurich', 'DD.MM HH24:MI'),
  180
)
from public.group_events e
where pn.source_table = 'group_events' and pn.source_id = e.id;

update public.push_notifications
set body = 'Details disponibles dans Dispo'
where source_table = 'group_event_cancellations';

-- Les anciens clients n'envoient pas public_location_label. Le trigger capte
-- alors leur champ historique AVANT ecriture publique (donc avant Realtime),
-- puis ne laisse que le libelle deja connu ou une valeur generique.
create or replace function private.capture_legacy_gig_request_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input text := btrim(coalesce(new.place, ''));
  v_label text := btrim(coalesce(new.public_location_label, ''));
  v_rpc_write boolean := coalesce(
    current_setting('dispo.location_rpc', true) = 'on', false
  );
begin
  -- Y compris pour les ecritures service-role : une adresse precise ne doit
  -- jamais survivre dans la ligne publique. Seules les RPC ci-dessous posent
  -- ce marqueur transactionnel apres avoir separe libelle et adresse.
  if v_rpc_write then
    return new;
  end if;

  if v_input <> '' and v_input is distinct from v_label then
    insert into private.gig_request_locations(gig_id, exact_address, updated_at)
    values (new.id, left(v_input, 600), now())
    on conflict (gig_id) do update
      set exact_address = excluded.exact_address,
          updated_at = now();
  end if;

  if v_label = '' then
    v_label := coalesce(
      nullif(left(btrim(coalesce(new.neighborhood, '')), 160), ''),
      case when v_input = '' then '' else 'Lieu communique apres confirmation' end
    );
  end if;
  new.public_location_label := left(v_label, 160);
  new.place := new.public_location_label;
  return new;
end;
$$;

create or replace function private.capture_legacy_group_event_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input text := btrim(coalesce(new.venue, ''));
  v_label text := btrim(coalesce(new.public_location_label, ''));
  v_rpc_write boolean := coalesce(
    current_setting('dispo.location_rpc', true) = 'on', false
  );
begin
  -- Meme garantie pour les imports et fonctions serveur sans JWT utilisateur.
  if v_rpc_write then
    return new;
  end if;

  if v_input <> '' and v_input is distinct from v_label then
    insert into private.group_event_locations(event_id, exact_address, updated_at)
    values (new.id, left(v_input, 600), now())
    on conflict (event_id) do update
      set exact_address = excluded.exact_address,
          updated_at = now();
  end if;

  if v_label = '' and v_input <> '' then
    v_label := 'Lieu communique apres confirmation';
  end if;
  new.public_location_label := left(v_label, 160);
  new.venue := new.public_location_label;
  return new;
end;
$$;

revoke all on function private.capture_legacy_gig_request_location()
  from public, anon, authenticated;
revoke all on function private.capture_legacy_group_event_location()
  from public, anon, authenticated;

drop trigger if exists gig_requests_99_capture_private_location on public.gig_requests;
create trigger gig_requests_99_capture_private_location
before insert or update of place, public_location_label on public.gig_requests
for each row execute function private.capture_legacy_gig_request_location();

drop trigger if exists group_events_99_capture_private_location on public.group_events;
create trigger group_events_99_capture_private_location
before insert or update of venue, public_location_label on public.group_events
for each row execute function private.capture_legacy_group_event_location();

create or replace function private.can_view_group_event_location(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.group_events e
    join public.music_groups mg on mg.id = e.group_id
    where e.id = p_event_id
      and (
        mg.leader_id = p_user_id
        or (
          -- Defense en profondeur : une ancienne ligne de presence, une
          -- importation service-role ou une future regression RLS ne doit
          -- jamais suffire a reveler une adresse a un non-membre.
          exists (
            select 1 from public.group_members gm
            where gm.group_id = e.group_id
              and gm.profile_id = p_user_id
          )
          and exists (
            select 1 from public.event_attendance ea
            where ea.event_id = e.id
              and ea.profile_id = p_user_id
              and ea.status = 'available'
          )
        )
        or exists (
          select 1
          from public.gig_requests g
          join public.gig_applications a
            on a.gig_id = g.id and a.status = 'accepted'
          where g.event_id = e.id and a.musician_id = p_user_id
        )
        or exists (
          select 1 from public.gig_requests g
          where g.event_id = e.id
            and g.target_id = p_user_id
            and g.target_status = 'accepted'
        )
      )
  );
$$;

create or replace function private.can_view_gig_request_location(
  p_gig_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.gig_requests g
    where g.id = p_gig_id
      and (
        g.host_id = p_user_id
        or (g.target_id = p_user_id and g.target_status = 'accepted')
        or exists (
          select 1 from public.gig_applications a
          where a.gig_id = g.id
            and a.musician_id = p_user_id
            and a.status = 'accepted'
        )
        or (
          g.event_id is not null
          and private.can_view_group_event_location(g.event_id, p_user_id)
        )
      )
  );
$$;

revoke all on function private.can_view_group_event_location(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_view_gig_request_location(uuid, uuid)
  from public, anon, authenticated;

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

  update public.group_events
  set public_location_label = v_label, venue = v_label
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

create or replace function public.set_gig_request_location(
  p_gig_id uuid,
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
  v_event uuid;
  v_label text := left(btrim(coalesce(p_public_location_label, '')), 160);
  v_exact text := btrim(coalesce(p_exact_address, ''));
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select g.event_id into v_event
  from public.gig_requests g
  where g.id = p_gig_id and g.host_id = v_user;
  if not found then
    raise exception 'only_gig_host_can_set_location' using errcode = '42501';
  end if;

  if coalesce(p_clear_exact_address, false) and v_exact <> '' then
    raise exception 'invalid_gig_location' using errcode = '22023';
  end if;

  -- Un SOS lie herite de l'emplacement canonique de l'evenement. NULL/vide
  -- signifie « preserver », jamais « effacer ». C'est notamment le cas des
  -- SOS automatiques crees depuis une occurrence deja enregistree.
  if v_event is not null then
    if v_exact = '' and not coalesce(p_clear_exact_address, false) then
      select coalesce(
        nullif(btrim(e.public_location_label), ''),
        nullif(btrim(e.venue), ''),
        v_label
      )
      into v_label
      from public.group_events e
      where e.id = v_event;
    end if;
    -- La RPC event reverifie aussi que l'hote est toujours leader du groupe.
    perform public.set_group_event_location(
      v_event, v_label, nullif(v_exact, ''), p_postal_code, p_city,
      p_country_code, p_latitude, p_longitude,
      coalesce(p_clear_exact_address, false)
    );
    if coalesce(p_clear_exact_address, false) or v_exact <> '' then
      delete from private.gig_request_locations where gig_id = p_gig_id;
    end if;
    return;
  end if;

  if length(v_exact) > 600
     or (p_postal_code is not null and length(btrim(p_postal_code)) > 32)
     or (p_city is not null and length(btrim(p_city)) > 100)
     or upper(coalesce(p_country_code, 'CH')) !~ '^[A-Z]{2}$'
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180)
  then
    raise exception 'invalid_gig_location' using errcode = '22023';
  end if;
  if v_label = '' and v_exact <> '' then
    v_label := coalesce(
      (select nullif(left(btrim(g.neighborhood), 160), '')
       from public.gig_requests g where g.id = p_gig_id),
      'Lieu communique apres confirmation'
    );
  end if;

  perform set_config('dispo.location_rpc', 'on', true);

  if coalesce(p_clear_exact_address, false) then
    delete from private.gig_request_locations where gig_id = p_gig_id;
  elsif v_exact <> '' then
    insert into private.gig_request_locations(
      gig_id, exact_address, postal_code, city, country_code,
      latitude, longitude, updated_at
    ) values (
      p_gig_id, v_exact, nullif(btrim(p_postal_code), ''),
      nullif(btrim(p_city), ''), upper(coalesce(p_country_code, 'CH')),
      p_latitude, p_longitude, now()
    )
    on conflict (gig_id) do update
      set exact_address = excluded.exact_address,
          postal_code = excluded.postal_code,
          city = excluded.city,
          country_code = excluded.country_code,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          updated_at = now();
  end if;

  update public.gig_requests
  set public_location_label = v_label, place = v_label
  where id = p_gig_id;
end;
$$;

-- Creation et edition de dates + adresse privee dans UNE transaction. Le
-- client envoie pour chaque adresse une intention explicite : valeur non vide,
-- clear_exact_address=true, ou preserve (les deux absents/faux).
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
    exception when others then
      raise exception 'invalid_group_event_payload' using errcode = '22023';
    end;

    if v_event_id is null
       or nullif(btrim(v_item ->> 'kind'), '') is null
       or nullif(btrim(v_item ->> 'title'), '') is null
       or nullif(v_item ->> 'date', '') is null
       or (v_clear and v_exact <> '')
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
        nullif(v_item ->> 'reminder_lead_days', '')::integer
      );
    else
      update public.group_events e
      set kind = btrim(v_item ->> 'kind'),
          title = btrim(v_item ->> 'title'),
          venue = v_label,
          public_location_label = v_label,
          date = (v_item ->> 'date')::timestamptz
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

create or replace function public.get_group_event_location(p_event_id uuid)
returns table (
  event_id uuid,
  public_location_label text,
  exact_address text,
  postal_code text,
  city text,
  country_code text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,
         coalesce(nullif(e.public_location_label, ''), e.venue),
         l.exact_address, l.postal_code, l.city, l.country_code,
         l.latitude, l.longitude
  from public.group_events e
  left join private.group_event_locations l on l.event_id = e.id
  where e.id = p_event_id
    and private.can_view_group_event_location(e.id, (select auth.uid()));
$$;

create or replace function public.visible_group_event_locations()
returns table (
  event_id uuid,
  public_location_label text,
  exact_address text,
  postal_code text,
  city text,
  country_code text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,
         coalesce(nullif(e.public_location_label, ''), e.venue),
         l.exact_address, l.postal_code, l.city, l.country_code,
         l.latitude, l.longitude
  from public.group_events e
  left join private.group_event_locations l on l.event_id = e.id
  where private.can_view_group_event_location(e.id, (select auth.uid()))
  order by e.date, e.id;
$$;

create or replace function public.get_gig_request_location(p_gig_id uuid)
returns table (
  gig_id uuid,
  public_location_label text,
  exact_address text,
  postal_code text,
  city text,
  country_code text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id,
         coalesce(nullif(g.public_location_label, ''), g.place),
         coalesce(el.exact_address, gl.exact_address),
         coalesce(el.postal_code, gl.postal_code),
         coalesce(el.city, gl.city),
         coalesce(el.country_code, gl.country_code),
         coalesce(el.latitude, gl.latitude),
         coalesce(el.longitude, gl.longitude)
  from public.gig_requests g
  left join private.gig_request_locations gl on gl.gig_id = g.id
  left join private.group_event_locations el on el.event_id = g.event_id
  where g.id = p_gig_id
    and private.can_view_gig_request_location(g.id, (select auth.uid()));
$$;

create or replace function public.visible_gig_request_locations()
returns table (
  gig_id uuid,
  public_location_label text,
  exact_address text,
  postal_code text,
  city text,
  country_code text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id,
         coalesce(nullif(g.public_location_label, ''), g.place),
         coalesce(el.exact_address, gl.exact_address),
         coalesce(el.postal_code, gl.postal_code),
         coalesce(el.city, gl.city),
         coalesce(el.country_code, gl.country_code),
         coalesce(el.latitude, gl.latitude),
         coalesce(el.longitude, gl.longitude)
  from public.gig_requests g
  left join private.gig_request_locations gl on gl.gig_id = g.id
  left join private.group_event_locations el on el.event_id = g.event_id
  where private.can_view_gig_request_location(g.id, (select auth.uid()))
  order by g.date, g.id;
$$;

revoke all on function public.set_group_event_location(
  uuid, text, text, text, text, text, double precision, double precision, boolean
) from public, anon;
revoke all on function public.set_gig_request_location(
  uuid, text, text, text, text, text, double precision, double precision, boolean
) from public, anon;
revoke all on function public.save_group_events_with_locations(uuid, jsonb, text)
  from public, anon;
revoke all on function public.get_group_event_location(uuid) from public, anon;
revoke all on function public.visible_group_event_locations() from public, anon;
revoke all on function public.get_gig_request_location(uuid) from public, anon;
revoke all on function public.visible_gig_request_locations() from public, anon;
grant execute on function public.set_group_event_location(
  uuid, text, text, text, text, text, double precision, double precision, boolean
) to authenticated;
grant execute on function public.set_gig_request_location(
  uuid, text, text, text, text, text, double precision, double precision, boolean
) to authenticated;
grant execute on function public.save_group_events_with_locations(uuid, jsonb, text)
  to authenticated;
grant execute on function public.get_group_event_location(uuid) to authenticated;
grant execute on function public.visible_group_event_locations() to authenticated;
grant execute on function public.get_gig_request_location(uuid) to authenticated;
grant execute on function public.visible_gig_request_locations() to authenticated;

-- La vue conserve `place` a sa position historique et ajoute le nouveau champ
-- uniquement en fin de projection, afin de ne pas casser les DTO existants.
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
          else null::text end as public_location_label
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

-- -------------------------------------------------------------------------
-- Monétisation groupes : le premier groupe dirige est gratuit. Un abonnement
-- Premium serveur est requis a partir du deuxieme ; etre simple membre ne
-- compte jamais dans cette limite.
-- -------------------------------------------------------------------------

create or replace function public.can_create_music_group()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    coalesce((
      select p.is_premium
      from public.profiles p
      where p.id = (select auth.uid())
    ), false)
    or not exists (
      select 1
      from public.music_groups g
      where g.leader_id = (select auth.uid())
    )
  );
$$;

revoke all on function public.can_create_music_group() from public, anon;
grant execute on function public.can_create_music_group() to authenticated;

drop policy if exists music_groups_insert_premium on public.music_groups;
drop policy if exists music_groups_insert_own on public.music_groups;
drop policy if exists music_groups_insert_first_free_or_premium on public.music_groups;
create policy music_groups_insert_first_free_or_premium
on public.music_groups
for insert to authenticated
with check (
  leader_id = (select auth.uid())
  and public.can_create_music_group()
);

create or replace function private.enforce_music_group_creation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_premium boolean;
begin
  -- Migrations et operations de service sans JWT restent possibles.
  if v_user is null then
    return new;
  end if;
  if new.leader_id <> v_user then
    raise exception 'group_leader_must_be_current_user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 37001));
  select coalesce(p.is_premium, false) into v_premium
  from public.profiles p where p.id = v_user;

  if not coalesce(v_premium, false) and exists (
    select 1 from public.music_groups g where g.leader_id = v_user
  ) then
    raise exception 'premium_required_for_additional_group' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_music_group_creation_limit()
  from public, anon, authenticated;

drop trigger if exists music_groups_01_creation_limit on public.music_groups;
create trigger music_groups_01_creation_limit
before insert on public.music_groups
for each row execute function private.enforce_music_group_creation_limit();

-- L'automatisation SOS est un droit serveur, pas seulement un Toggle Swift.
-- Un leader dont l'abonnement expire peut toujours la DESACTIVER.
create or replace function private.enforce_auto_sos_premium()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_premium boolean;
begin
  -- Imports/migrations de service restent possibles ; leurs secrets et leur
  -- responsabilité sont hors de la surface cliente authentifiée.
  if v_user is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.auto_sos_enabled is not distinct from old.auto_sos_enabled
     and new.auto_sos_min_level is not distinct from old.auto_sos_min_level
  then
    return new;
  end if;
  if new.leader_id <> v_user then
    raise exception 'only_group_leader_can_configure_auto_sos'
      using errcode = '42501';
  end if;
  if not coalesce(new.auto_sos_enabled, false) then
    return new;
  end if;

  select coalesce(p.is_premium, false) into v_premium
  from public.profiles p where p.id = v_user;
  if not coalesce(v_premium, false) then
    raise exception 'premium_required_for_auto_sos' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_auto_sos_premium()
  from public, anon, authenticated;

drop trigger if exists music_groups_02_auto_sos_premium on public.music_groups;
create trigger music_groups_02_auto_sos_premium
before insert or update of auto_sos_enabled, auto_sos_min_level
on public.music_groups
for each row execute function private.enforce_auto_sos_premium();

-- Une occurrence unique reste gratuite. Seule la CREATION d'une serie est
-- payante : le trigger ne couvre volontairement pas UPDATE, afin qu'une
-- expiration Premium ne bloque jamais l'edition/annulation d'une serie deja
-- creee.
create or replace function private.enforce_recurring_event_premium()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_is_leader boolean;
  v_premium boolean;
begin
  if v_user is null then
    return new;
  end if;

  -- Après expiration, une série existante reste éditable. Pour le rappel,
  -- revenir au délai gratuit de deux jours reste toujours possible.
  if tg_op = 'UPDATE'
     and new.reminder_lead_days is not distinct from old.reminder_lead_days
  then
    return new;
  end if;
  if tg_op = 'INSERT'
     and new.series_id is null
     and coalesce(new.reminder_lead_days, 2) = 2
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 37003));

  select g.leader_id = v_user, coalesce(p.is_premium, false)
  into v_is_leader, v_premium
  from public.music_groups g
  join public.profiles p on p.id = g.leader_id
  where g.id = new.group_id;

  if not coalesce(v_is_leader, false) then
    raise exception 'only_group_leader_can_configure_event'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.series_id is not null
     and not coalesce(v_premium, false)
  then
    raise exception 'premium_required_for_recurring_events' using errcode = '42501';
  end if;
  if coalesce(new.reminder_lead_days, 2) <> 2
     and not coalesce(v_premium, false)
  then
    raise exception 'premium_required_for_configurable_reminders'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_recurring_event_premium()
  from public, anon, authenticated;

drop trigger if exists group_events_03_recurring_premium on public.group_events;
drop trigger if exists group_events_03_premium_settings on public.group_events;
drop trigger if exists group_events_03_reminder_premium on public.group_events;
create trigger group_events_03_premium_settings
before insert on public.group_events
for each row execute function private.enforce_recurring_event_premium();
create trigger group_events_03_reminder_premium
before update of reminder_lead_days on public.group_events
for each row execute function private.enforce_recurring_event_premium();

-- Le transfert ne peut pas passer par l'UPDATE direct historique : sa policy
-- WITH CHECK evalue le nouveau leader avec l'identite de l'ancien. Cette RPC
-- garde l'operation atomique et applique au destinataire la meme regle que la
-- creation (aucun groupe dirige, ou Premium serveur).
create or replace function public.transfer_group_leadership(
  p_group_id uuid,
  p_new_leader_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_current_leader uuid;
  v_target_premium boolean;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 37002));

  select g.leader_id into v_current_leader
  from public.music_groups g
  where g.id = p_group_id
  for update;

  if not found then
    raise exception 'group_not_found' using errcode = '22023';
  end if;
  if v_current_leader <> v_user then
    raise exception 'only_current_leader_can_transfer' using errcode = '42501';
  end if;
  if p_new_leader_id = v_current_leader then
    return;
  end if;
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.profile_id = p_new_leader_id
  ) then
    raise exception 'new_leader_must_be_group_member' using errcode = '22023';
  end if;

  -- Meme verrou que le trigger de creation : transfert et creation
  -- simultanes ne peuvent jamais offrir deux premiers groupes gratuits.
  perform pg_advisory_xact_lock(
    hashtextextended(p_new_leader_id::text, 37001)
  );

  select coalesce(p.is_premium, false) into v_target_premium
  from public.profiles p
  where p.id = p_new_leader_id;

  if not coalesce(v_target_premium, false) and exists (
    select 1
    from public.music_groups g
    where g.leader_id = p_new_leader_id
      and g.id <> p_group_id
  ) then
    raise exception 'premium_required_for_additional_group' using errcode = '42501';
  end if;

  update public.group_members
  set kind = 'permanent'
  where group_id = p_group_id and profile_id = p_new_leader_id;

  update public.music_groups
  set leader_id = p_new_leader_id
  where id = p_group_id;
end;
$$;

revoke all on function public.transfer_group_leadership(uuid, uuid)
  from public, anon;
grant execute on function public.transfer_group_leadership(uuid, uuid)
  to authenticated;
