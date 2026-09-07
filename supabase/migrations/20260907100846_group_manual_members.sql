-- Members recorded by a leader without creating a profile or an Auth account.
create table public.group_manual_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.music_groups(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  role text check (role is null or (role = btrim(role) and char_length(role) between 1 and 120)),
  kind text not null default 'permanent' check (kind in ('permanent', 'guest')),
  created_at timestamptz not null default now()
);
create index group_manual_members_group_idx on public.group_manual_members(group_id);
alter table public.group_manual_members enable row level security;
revoke all on public.group_manual_members from public, anon, authenticated;
grant select, delete on public.group_manual_members to authenticated;
grant insert (group_id, name, role, kind), update (name, role, kind)
  on public.group_manual_members to authenticated;
create policy group_manual_members_read on public.group_manual_members
  for select to authenticated using (public.is_group_member(group_id));
create policy group_manual_members_add on public.group_manual_members
  for insert to authenticated with check (public.is_group_leader(group_id));
create policy group_manual_members_edit on public.group_manual_members
  for update to authenticated using (public.is_group_leader(group_id))
  with check (public.is_group_leader(group_id));
create policy group_manual_members_remove on public.group_manual_members
  for delete to authenticated using (public.is_group_leader(group_id));
alter publication supabase_realtime add table public.group_manual_members;

-- Keep the existing solo RPC and its leader checks; accept manual group members too.
create or replace function public.set_group_song_solos(
  p_group_id uuid,
  p_song_id uuid,
  p_profile_ids uuid[]
)
returns void
language plpgsql
security invoker
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

  -- Serialize assignment and removal so a deleted member cannot be reintroduced.
  perform 1 from public.music_groups where id = p_group_id for update;

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
        select 1 from public.group_manual_members m
        where m.group_id = p_group_id and m.id = requested.id
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

-- Removing a manual member also removes their assignments, keeping song order/metadata.
create or replace function private.remove_manual_member_solos()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.music_groups where id = old.group_id for update;
  update public.music_groups g set repertoire = (
    select coalesce(jsonb_agg(
      case when song.value->'solos' ? old.id::text then
        jsonb_set(song.value, '{solos}', (song.value->'solos') - old.id::text)
      else song.value end order by song.ordinal), '[]'::jsonb)
    from jsonb_array_elements(g.repertoire) with ordinality song(value, ordinal)
  ) where g.id = old.group_id
      and exists (select 1 from jsonb_array_elements(g.repertoire) song where song->'solos' ? old.id::text);
  update public.group_events e set setlist = (
    select coalesce(jsonb_agg(
      case when song.value->'solos' ? old.id::text then
        jsonb_set(song.value, '{solos}', (song.value->'solos') - old.id::text)
      else song.value end order by song.ordinal), '[]'::jsonb)
    from jsonb_array_elements(e.setlist) with ordinality song(value, ordinal)
  ) where e.group_id = old.group_id
      and exists (select 1 from jsonb_array_elements(e.setlist) song where song->'solos' ? old.id::text);
  return old;
end;
$$;
revoke all on function private.remove_manual_member_solos() from public, anon, authenticated;
create trigger group_manual_members_remove_solos before delete on public.group_manual_members
for each row execute function private.remove_manual_member_solos();
