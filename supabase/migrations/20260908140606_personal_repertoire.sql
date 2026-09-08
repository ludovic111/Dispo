-- Personal musical library: private by default, independent from group permissions.
-- Hidden rows are durable exclusions: automatic imports must never revive them.
create table public.personal_repertoire_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  is_public boolean not null default false
);
create table public.personal_repertoire (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  song jsonb not null,
  identity text not null,
  mastery smallint not null default 0 check (mastery between 0 and 3),
  style text not null default '' check (length(style) <= 60),
  origin text not null default 'manual' check (origin in ('manual', 'group')),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, identity),
  check (jsonb_typeof(song) = 'object' and length(btrim(song->>'title')) between 1 and 200
    and length(coalesce(song->>'artist','')) <= 200 and pg_column_size(song) <= 16384)
);
alter table public.personal_repertoire enable row level security;
alter table public.personal_repertoire_settings enable row level security;
revoke all on public.personal_repertoire, public.personal_repertoire_settings from public, anon, authenticated;
grant select on public.personal_repertoire to authenticated;
grant update (mastery, style, hidden) on public.personal_repertoire to authenticated;
grant select, insert, update on public.personal_repertoire_settings to authenticated;
grant all on public.personal_repertoire, public.personal_repertoire_settings to service_role;

-- Internal lookup needs definer rights because a block in the other direction is
-- intentionally not readable through the blocks table's owner-only RLS.
create function private.can_read_personal_repertoire(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    p_owner = (select auth.uid()) or (
      exists (select 1 from public.personal_repertoire_settings s where s.profile_id = p_owner and s.is_public)
      and exists (select 1 from public.profiles p where p.id = p_owner and length(btrim(p.name)) >= 2 and cardinality(p.instruments) > 0)
      and not exists (select 1 from public.blocks b where
        (b.blocker_id = p_owner and b.blocked_id = (select auth.uid())) or
        (b.blocked_id = p_owner and b.blocker_id = (select auth.uid())))
    )
  )
$$;
revoke all on function private.can_read_personal_repertoire(uuid) from public, anon;
grant execute on function private.can_read_personal_repertoire(uuid) to authenticated;
create policy personal_repertoire_read on public.personal_repertoire for select to authenticated
  using (profile_id = (select auth.uid()) or (not hidden and private.can_read_personal_repertoire(profile_id)));
create policy personal_repertoire_update on public.personal_repertoire for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy personal_repertoire_settings_read on public.personal_repertoire_settings for select to authenticated
  using (private.can_read_personal_repertoire(profile_id));
create policy personal_repertoire_settings_insert on public.personal_repertoire_settings for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy personal_repertoire_settings_update on public.personal_repertoire_settings for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create function private.personal_song_identity(p_song jsonb)
returns text language sql immutable set search_path = '' as $$
  select md5(jsonb_build_array(
    lower(regexp_replace(btrim(coalesce(p_song->>'title','')), '\s+', ' ', 'g')),
    lower(regexp_replace(btrim(coalesce(p_song->>'artist','')), '\s+', ' ', 'g'))
  )::text)
$$;
-- Never import solos, the contributor, private notes or arbitrary group data.
create function private.personal_song_payload(p_song jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p_song) where key = any(array[
    'title','artist','album_title','artwork_url','catalog_id','canonical_song_id',
    'composer','duration_ms','genre','genres','ireal_disabled','ireal_url','isrc',
    'key','metadata_source','metadata_updated_at','platform_ids','platform_links',
    'preview_url','release_year','tempo_bpm','track_url'
  ])
$$;
revoke all on function private.personal_song_identity(jsonb), private.personal_song_payload(jsonb) from public, anon, authenticated;

create function private.personal_songs_match(a jsonb, b jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select private.personal_song_identity(a) = private.personal_song_identity(b)
    or exists (select 1 from unnest(array['canonical_song_id','catalog_id','isrc']) k
      where nullif(btrim(a->>k),'') is not null and lower(btrim(a->>k)) = lower(btrim(b->>k)))
$$;
revoke all on function private.personal_songs_match(jsonb,jsonb) from public, anon, authenticated;

-- Called only by trusted triggers/backfill. Serializes with manual removal/addition
-- through the profile lock, and preserves personal mastery/style on metadata refresh.
create function private.import_personal_songs(p_profile uuid, p_songs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_song jsonb; v_payload jsonb; v_identity text; v_existing uuid;
begin
  if p_profile is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 54001));
  for v_song in select value from jsonb_array_elements(coalesce(p_songs,'[]')) loop
    if v_song->>'is_approved' is distinct from 'true' or nullif(btrim(v_song->>'title'),'') is null then continue; end if;
    v_payload := private.personal_song_payload(v_song);
    v_identity := private.personal_song_identity(v_payload);
    select id into v_existing from public.personal_repertoire
      where profile_id=p_profile and private.personal_songs_match(song,v_payload)
      order by hidden desc, created_at, id limit 1;
    if v_existing is not null then
      update public.personal_repertoire set song=v_payload where id=v_existing
        and not hidden and origin='group' and song is distinct from v_payload;
    else
      insert into public.personal_repertoire(profile_id,song,identity,origin)
      values(p_profile,v_payload,v_identity,'group') on conflict (profile_id,identity) do nothing;
    end if;
  end loop;
end;
$$;
revoke all on function private.import_personal_songs(uuid,jsonb) from public, anon, authenticated;

create function private.sync_personal_repertoire_from_group()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_profile uuid; v_group uuid; v_songs jsonb;
begin
  if tg_table_name = 'music_groups' then v_group := new.id; v_songs := new.repertoire;
  else v_group := new.group_id; v_songs := new.setlist; end if;
  for v_profile in select profile_id from public.group_members where group_id = v_group order by profile_id loop
    perform private.import_personal_songs(v_profile, v_songs);
  end loop;
  return new;
end;
$$;
create function private.sync_personal_repertoire_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_songs jsonb;
begin
  select repertoire into v_songs from public.music_groups where id = new.group_id;
  perform private.import_personal_songs(new.profile_id, v_songs);
  for v_songs in select setlist from public.group_events where group_id = new.group_id order by id loop
    perform private.import_personal_songs(new.profile_id, v_songs);
  end loop;
  return new;
end;
$$;
revoke all on function private.sync_personal_repertoire_from_group(), private.sync_personal_repertoire_membership() from public, anon, authenticated;
create trigger personal_repertoire_group_sync after insert or update of repertoire on public.music_groups
  for each row execute function private.sync_personal_repertoire_from_group();
create trigger personal_repertoire_event_sync after insert or update of setlist on public.group_events
  for each row execute function private.sync_personal_repertoire_from_group();
create trigger personal_repertoire_member_sync after insert on public.group_members
  for each row execute function private.sync_personal_repertoire_membership();

-- Definer implementation in private, authenticated invoker API wrapper. No caller
-- can choose another owner or directly bypass the identity/sanitization rules.
create function private.add_personal_song(p_song jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_payload jsonb; v_id uuid;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if jsonb_typeof(p_song) is distinct from 'object' or coalesce(length(btrim(p_song->>'title')),0) not between 1 and 200
    or length(coalesce(p_song->>'artist','')) > 200 or pg_column_size(p_song) > 16384
  then raise exception 'invalid_song' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 54001));
  v_payload := private.personal_song_payload(p_song) || jsonb_build_object('title', btrim(p_song->>'title'), 'artist', btrim(coalesce(p_song->>'artist','')));
  select id into v_id from public.personal_repertoire where profile_id=v_owner
    and private.personal_songs_match(song,v_payload) order by hidden desc,created_at,id limit 1;
  if v_id is not null then
    update public.personal_repertoire set hidden=false,origin='manual',song=v_payload where id=v_id;
  else
    insert into public.personal_repertoire(profile_id,song,identity,origin)
    values(v_owner,v_payload,private.personal_song_identity(v_payload),'manual') returning id into v_id;
  end if;
  return v_id;
end;
$$;
create function public.add_personal_song(p_song jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select private.add_personal_song(p_song)
$$;
revoke all on function private.add_personal_song(jsonb), public.add_personal_song(jsonb) from public, anon;
grant execute on function private.add_personal_song(jsonb), public.add_personal_song(jsonb) to authenticated;

-- Initial import also covers existing members. No existing profile field is erased.
do $$ declare v_record record; begin
  for v_record in select m.profile_id,g.repertoire from public.group_members m join public.music_groups g on g.id=m.group_id order by m.profile_id,g.id loop
    perform private.import_personal_songs(v_record.profile_id,v_record.repertoire);
  end loop;
  for v_record in select m.profile_id,e.setlist from public.group_members m join public.group_events e on e.group_id=m.group_id order by m.profile_id,e.id loop
    perform private.import_personal_songs(v_record.profile_id,v_record.setlist);
  end loop;
end $$;
