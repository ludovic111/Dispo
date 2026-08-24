-- Dispo 2.4 — intégrité des setlists et des SOS liés à une session.
--
-- Deux incohérences pouvaient jusqu'ici se produire :
--   1. la policy historique autorise un membre du groupe à PATCHer toute la
--      ligne group_events afin qu'il puisse suggérer un morceau. Sans garde
--      serveur sur le JSON, il pouvait aussi modifier/réordonner la setlist ;
--   2. un SOS lié par event_id pouvait conserver une autre date (ou un autre
--      groupe/lieu) que la session. L'agenda affichait alors deux rendez-vous
--      qui représentaient pourtant le même événement.

-- ---------------------------------------------------------------------------
-- 1. Les champs d'une session restent réservés au leader
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
  -- Les opérations serveur et les migrations ne portent pas de JWT utilisateur.
  if v_uid is null then
    return new;
  end if;

  -- Une session ne change jamais de groupe : une nouvelle session doit être
  -- créée dans le groupe de destination.
  if new.group_id is distinct from old.group_id then
    raise exception 'event_group_is_immutable' using errcode = '42501';
  end if;

  if new.date               is distinct from old.date
     or new.title           is distinct from old.title
     or new.venue           is distinct from old.venue
     or new.kind            is distinct from old.kind
     or new.series_id       is distinct from old.series_id
     or new.recurrence      is distinct from old.recurrence
     or new.reminder_lead_days is distinct from old.reminder_lead_days
     or new.created_at      is distinct from old.created_at
  then
    if not exists (
      select 1
      from public.music_groups g
      where g.id = old.group_id and g.leader_id = v_uid
    ) then
      raise exception 'only_leader_can_edit_event' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_group_event_core_fields() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Un membre peut uniquement ajouter/rafraîchir ses propres suggestions
-- ---------------------------------------------------------------------------

create or replace function public.guard_group_event_setlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_old_song jsonb;
  v_new_song jsonb;
begin
  if new.setlist is not distinct from old.setlist or v_uid is null then
    return new;
  end if;

  -- Le leader conserve la gestion complète : validation, suppression, solos
  -- et ordre au doigt.
  if exists (
    select 1
    from public.music_groups g
    where g.id = old.group_id and g.leader_id = v_uid
  ) then
    return new;
  end if;

  if not public.is_group_member(old.group_id) then
    raise exception 'group_membership_required' using errcode = '42501';
  end if;

  select p.name into v_name
  from public.profiles p
  where p.id = v_uid;

  if v_name is null
     or jsonb_typeof(old.setlist) <> 'array'
     or jsonb_typeof(new.setlist) <> 'array'
  then
    raise exception 'invalid_event_setlist' using errcode = '22023';
  end if;

  -- Les identifiants sont la clé stable partagée par iOS et Android.
  if exists (
    select 1
    from jsonb_array_elements(new.setlist) s(value)
    where jsonb_typeof(s.value) <> 'object'
       or nullif(s.value ->> 'id', '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(new.setlist) s(value)
    group by s.value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'invalid_or_duplicate_song_id' using errcode = '22023';
  end if;

  -- Aucun morceau déjà présent ne peut disparaître. Les morceaux validés et
  -- les suggestions des autres membres restent octet pour octet identiques.
  for v_old_song in select s.value from jsonb_array_elements(old.setlist) s(value)
  loop
    select s.value into v_new_song
    from jsonb_array_elements(new.setlist) s(value)
    where (s.value ->> 'id') = (v_old_song ->> 'id')
    limit 1;

    if not found then
      raise exception 'member_cannot_remove_setlist_song' using errcode = '42501';
    end if;

    if coalesce((v_old_song ->> 'is_approved')::boolean, true)
       or coalesce(v_old_song ->> 'suggested_by', '') <> v_name
    then
      if v_new_song is distinct from v_old_song then
        raise exception 'member_cannot_edit_setlist_song' using errcode = '42501';
      end if;
    elsif coalesce((v_new_song ->> 'is_approved')::boolean, true)
       or coalesce(v_new_song ->> 'suggested_by', '') <> v_name
    then
      raise exception 'member_cannot_approve_setlist_song' using errcode = '42501';
    end if;
  end loop;

  -- Tout nouvel objet est obligatoirement une suggestion du membre connecté.
  for v_new_song in
    select n.value
    from jsonb_array_elements(new.setlist) n(value)
    where not exists (
      select 1
      from jsonb_array_elements(old.setlist) o(value)
      where o.value ->> 'id' = n.value ->> 'id'
    )
  loop
    if coalesce((v_new_song ->> 'is_approved')::boolean, true)
       or coalesce(v_new_song ->> 'suggested_by', '') <> v_name
    then
      raise exception 'member_can_only_add_own_suggestion' using errcode = '42501';
    end if;
  end loop;

  -- Même si toutes les cartes validées sont intactes, leur ordre est une
  -- décision du leader.
  if (
    select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(old.setlist) with ordinality s(value, ordinal)
    where coalesce((value ->> 'is_approved')::boolean, true)
  ) is distinct from (
    select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(new.setlist) with ordinality s(value, ordinal)
    where coalesce((value ->> 'is_approved')::boolean, true)
  ) then
    raise exception 'only_leader_can_reorder_setlist' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_group_event_setlist() from public, anon, authenticated;

drop trigger if exists group_events_guard_setlist on public.group_events;
create trigger group_events_guard_setlist
  before update of setlist on public.group_events
  for each row execute function public.guard_group_event_setlist();

-- ---------------------------------------------------------------------------
-- 3. Mutations atomiques partagées par iOS et Android
-- ---------------------------------------------------------------------------

-- Réordonne uniquement les cartes validées et laisse chaque suggestion dans
-- son emplacement. Le calcul part toujours de la dernière valeur verrouillée
-- en base : une suggestion arrivée pendant un drag ne peut donc pas être
-- écrasée par un ancien snapshot client.
create or replace function public.apply_approved_song_order(
  p_items jsonb,
  p_song_ids text[]
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_id text;
  v_song jsonb;
  v_seen text[] := array[]::text[];
  v_ordered jsonb[] := array[]::jsonb[];
  v_result jsonb := '[]'::jsonb;
  v_index integer := 1;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_song_array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    where jsonb_typeof(s.value) <> 'object'
       or nullif(s.value ->> 'id', '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(p_items) s(value)
    group by s.value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'invalid_or_duplicate_song_id' using errcode = '22023';
  end if;

  for v_id in
    select requested.id
    from unnest(coalesce(p_song_ids, array[]::text[])) with ordinality requested(id, ordinal)
    order by requested.ordinal
  loop
    if not (v_id = any(v_seen)) then
      select s.value into v_song
      from jsonb_array_elements(p_items) s(value)
      where (s.value ->> 'id') = v_id
        and coalesce((s.value ->> 'is_approved')::boolean, true)
      limit 1;

      if found then
        v_seen := array_append(v_seen, v_id);
        v_ordered := array_append(v_ordered, v_song);
      end if;
    end if;
  end loop;

  -- Les cartes que le client ne connaissait pas encore sont conservées à la
  -- fin de l'ordre validé, jamais supprimées.
  for v_song in
    select s.value
    from jsonb_array_elements(p_items) with ordinality s(value, ordinal)
    where coalesce((s.value ->> 'is_approved')::boolean, true)
    order by s.ordinal
  loop
    v_id := v_song ->> 'id';
    if not (v_id = any(v_seen)) then
      v_seen := array_append(v_seen, v_id);
      v_ordered := array_append(v_ordered, v_song);
    end if;
  end loop;

  for v_song in
    select s.value
    from jsonb_array_elements(p_items) with ordinality s(value, ordinal)
    order by s.ordinal
  loop
    if coalesce((v_song ->> 'is_approved')::boolean, true) then
      v_result := v_result || jsonb_build_array(v_ordered[v_index]);
      v_index := v_index + 1;
    else
      v_result := v_result || jsonb_build_array(v_song);
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.apply_approved_song_order(jsonb, text[]) from public, anon, authenticated;

create or replace function public.reorder_group_repertoire(
  p_group_id uuid,
  p_song_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_repertoire jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.music_groups g
    where g.id = p_group_id and g.leader_id = v_uid
  ) then
    raise exception 'only_leader_can_reorder_repertoire' using errcode = '42501';
  end if;

  update public.music_groups g
  set repertoire = public.apply_approved_song_order(g.repertoire, p_song_ids)
  where g.id = p_group_id
  returning g.repertoire into v_repertoire;

  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  return v_repertoire;
end;
$$;

revoke all on function public.reorder_group_repertoire(uuid, text[]) from public, anon;
grant execute on function public.reorder_group_repertoire(uuid, text[]) to authenticated;

create or replace function public.reorder_event_setlist(
  p_event_id uuid,
  p_song_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group_id uuid;
  v_setlist jsonb;
begin
  select e.group_id into v_group_id
  from public.group_events e
  where e.id = p_event_id;

  if v_group_id is null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if v_uid is null or not exists (
    select 1 from public.music_groups g
    where g.id = v_group_id and g.leader_id = v_uid
  ) then
    raise exception 'only_leader_can_reorder_setlist' using errcode = '42501';
  end if;

  update public.group_events e
  set setlist = public.apply_approved_song_order(e.setlist, p_song_ids)
  where e.id = p_event_id
  returning e.setlist into v_setlist;

  return v_setlist;
end;
$$;

revoke all on function public.reorder_event_setlist(uuid, text[]) from public, anon;
grant execute on function public.reorder_event_setlist(uuid, text[]) to authenticated;

create or replace function public.set_group_song_solos(
  p_group_id uuid,
  p_song_id uuid,
  p_profile_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile_ids uuid[];
  v_solos jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.music_groups g
    where g.id = p_group_id and g.leader_id = v_uid
  ) then
    raise exception 'only_leader_can_edit_solos' using errcode = '42501';
  end if;

  select coalesce(array_agg(d.id order by d.first_ordinal), array[]::uuid[])
  into v_profile_ids
  from (
    select requested.id, min(requested.ordinal) as first_ordinal
    from unnest(coalesce(p_profile_ids, array[]::uuid[]))
      with ordinality requested(id, ordinal)
    group by requested.id
  ) d;

  if exists (
    select 1
    from unnest(v_profile_ids) requested(id)
    where not exists (
      select 1 from public.group_members m
      where m.group_id = p_group_id and m.profile_id = requested.id
    )
      and not exists (
        select 1 from public.music_groups g
        where g.id = p_group_id and g.leader_id = requested.id
      )
  ) then
    raise exception 'soloist_must_be_group_member' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.music_groups g,
         jsonb_array_elements(g.repertoire) song(value)
    where g.id = p_group_id and song.value ->> 'id' = p_song_id::text
  ) and not exists (
    select 1
    from public.group_events e,
         jsonb_array_elements(e.setlist) song(value)
    where e.group_id = p_group_id and song.value ->> 'id' = p_song_id::text
  ) then
    raise exception 'song_not_found' using errcode = 'P0002';
  end if;

  v_solos := to_jsonb(v_profile_ids);

  update public.music_groups g
  set repertoire = (
    select coalesce(
      jsonb_agg(
        case
          when song.value ->> 'id' = p_song_id::text then
            case when cardinality(v_profile_ids) = 0
              then song.value - 'solos'
              else jsonb_set(song.value, '{solos}', v_solos, true)
            end
          else song.value
        end
        order by song.ordinal
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(g.repertoire) with ordinality song(value, ordinal)
  )
  where g.id = p_group_id
    and exists (
      select 1 from jsonb_array_elements(g.repertoire) song(value)
      where song.value ->> 'id' = p_song_id::text
    );

  update public.group_events e
  set setlist = (
    select coalesce(
      jsonb_agg(
        case
          when song.value ->> 'id' = p_song_id::text then
            case when cardinality(v_profile_ids) = 0
              then song.value - 'solos'
              else jsonb_set(song.value, '{solos}', v_solos, true)
            end
          else song.value
        end
        order by song.ordinal
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(e.setlist) with ordinality song(value, ordinal)
  )
  where e.group_id = p_group_id
    and exists (
      select 1 from jsonb_array_elements(e.setlist) song(value)
      where song.value ->> 'id' = p_song_id::text
    );
end;
$$;

revoke all on function public.set_group_song_solos(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_group_song_solos(uuid, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. event_id devient la source de vérité du rendez-vous lié
-- ---------------------------------------------------------------------------

create or replace function public.normalize_linked_gig_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_event public.group_events%rowtype;
begin
  if new.event_id is null then
    return new;
  end if;

  select * into v_event
  from public.group_events e
  where e.id = new.event_id;

  if not found then
    raise exception 'linked_event_not_found' using errcode = '23503';
  end if;

  if v_uid is not null and not exists (
    select 1
    from public.music_groups g
    where g.id = v_event.group_id and g.leader_id = v_uid
  ) then
    raise exception 'only_leader_can_link_gig_to_event' using errcode = '42501';
  end if;

  new.group_id := v_event.group_id;
  new.date := v_event.date;
  if v_event.venue <> '' then
    new.place := v_event.venue;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_linked_gig_event() from public, anon, authenticated;

drop trigger if exists gig_requests_normalize_linked_event on public.gig_requests;
create trigger gig_requests_normalize_linked_event
  before insert or update of event_id, date, group_id, place on public.gig_requests
  for each row execute function public.normalize_linked_gig_event();

create or replace function public.sync_linked_gigs_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gig_requests g
  set group_id = new.group_id,
      date = new.date,
      place = case when new.venue <> '' then new.venue else g.place end
  where g.event_id = new.id;
  return null;
end;
$$;

revoke all on function public.sync_linked_gigs_from_event() from public, anon, authenticated;

drop trigger if exists group_events_sync_linked_gigs on public.group_events;
create trigger group_events_sync_linked_gigs
  after update of date, venue, group_id on public.group_events
  for each row
  when (
    old.date is distinct from new.date
    or old.venue is distinct from new.venue
    or old.group_id is distinct from new.group_id
  )
  execute function public.sync_linked_gigs_from_event();

-- Répare les lignes déjà incohérentes (notamment les SOS créés avant ce garde).
update public.gig_requests g
set group_id = e.group_id,
    date = e.date,
    place = case when e.venue <> '' then e.venue else g.place end
from public.group_events e
where g.event_id = e.id
  and (
    g.group_id is distinct from e.group_id
    or g.date is distinct from e.date
    or (e.venue <> '' and g.place is distinct from e.venue)
  );
