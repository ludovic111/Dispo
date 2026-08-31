-- Test transactionnel local du catalogue canonique :
--   docker exec -i supabase_db_dispo \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/database/song_catalog_streaming_links.test.sql

begin;

do $$
begin
  if private.song_catalog_bounded_integer('401', 20, 400) is not null
    or private.song_catalog_bounded_integer(repeat('9', 1000), 1, 2147483647) is not null
    or private.song_catalog_bounded_integer('120', 20, 400) <> 120
  then
    raise exception 'Bounded legacy integer parsing is unsafe';
  end if;
  if private.song_catalog_canonical_uuid(
    '018f0f7c-1234-7abc-8def-0123456789ab'
  ) <> '018f0f7c-1234-7abc-8def-0123456789ab'::uuid
    or private.song_catalog_canonical_uuid('not-a-uuid') is not null
  then
    raise exception 'Canonical UUID parsing rejected a valid UUIDv7 or accepted invalid input';
  end if;
  if private.song_catalog_snapshot_has_public_identity(
    '{"title":"Titre privé","artist":"Groupe privé","key":"Fm","tempo_bpm":120}'::jsonb
  )
    or not private.song_catalog_snapshot_has_public_identity(
      '{"title":"Catalogué","catalog_id":"apple:123456"}'::jsonb
    )
    or not private.song_catalog_snapshot_has_public_identity(
      '{"title":"Avec ISRC","isrc":"US-S1Z-99-00001"}'::jsonb
    )
  then
    raise exception 'Private manual song catalog eligibility is unsafe';
  end if;
  if private.song_catalog_apple_id(
    '{"isrc":"US-S1Z-99-00001","catalog_id":"apple:foo"}'::jsonb
  ) is not null
    or private.song_catalog_apple_id(
      '{"catalog_id":" APPLE:123456 "}'::jsonb
    ) <> '123456'
  then
    raise exception 'Invalid Apple catalog id was promoted into canonical metadata';
  end if;
  if private.song_catalog_snapshot_identity(
    '{"title":"Titre A","catalog_id":"apple:123456"}'::jsonb
  ) <> private.song_catalog_snapshot_identity(
    '{"title":"Titre B","catalog_id":"APPLE:123456"}'::jsonb
  )
    or private.song_catalog_snapshot_identity(
      '{"title":"Titre A","isrc":"US-S1Z-99-00001","catalog_id":"apple:123456"}'::jsonb
    ) !~ '^isrc:'
  then
    raise exception 'Backfill identity does not prioritize ISRC then Apple catalog id';
  end if;
end;
$$;

set local role service_role;

do $$
begin
  if exists (
    select 1
    from public.song_catalog
    where metadata_source = 'legacy-json'
      and normalized_isrc is null
      and coalesce(platform_ids ->> 'appleMusic', '') !~ '^[0-9]+$'
  ) then
    raise exception 'Private manual legacy song was exposed in the global catalog';
  end if;
end;
$$;

insert into public.song_catalog (
  id, title, artist, composer, isrc, genres, metadata_source, platform_ids
) values (
  '81000000-0000-4000-8000-000000000001',
  'Déjà Vu SQL 81000001',
  'Beyoncé Test 81000001',
  'Rodney Jerkins',
  'ZZ-SQL-26-00001',
  array['R&B', 'Pop'],
  'sql-test',
  '{"appleMusic":"sql-apple-81000001"}'::jsonb
);

insert into public.song_platform_links (
  song_id, platform, market, url, external_id, source
) values
  (
    '81000000-0000-4000-8000-000000000001',
    'appleMusic', 'CH', 'https://music.apple.com/ch/song/sql-81000001',
    'sql-apple-81000001', 'sql-test'
  ),
  (
    '81000000-0000-4000-8000-000000000001',
    'spotify', 'ZZ', 'https://open.spotify.com/track/sql-81000001',
    'sql-spotify-81000001', 'sql-test'
  ),
  (
    '81000000-0000-4000-8000-000000000001',
    'appleMusic', 'US', 'https://geo.music.apple.com/us/song/sql-81000001',
    'sql-apple-geo-81000001', 'sql-test'
  );

insert into public.song_catalog (
  id, title, artist, artwork_url, updated_at
) values (
  '81000000-0000-4000-8000-000000000002',
  'Sans artiste SQL 81000002',
  '',
  null,
  '2000-01-01T00:00:00Z'
);

update public.song_catalog
set artwork_url = 'https://example.com/cover.jpg',
    tempo_bpm = 120,
    duration_ms = 180000,
    release_year = 2026
where id = '81000000-0000-4000-8000-000000000002';

do $$
declare
  catalog_row record;
begin
  select normalized_artist, updated_at into catalog_row
  from public.song_catalog
  where id = '81000000-0000-4000-8000-000000000002';

  if catalog_row.normalized_artist <> '' then
    raise exception 'Empty legacy artist was translated into catalog data';
  end if;
  if catalog_row.updated_at <= '2000-01-01T00:00:00Z'::timestamptz then
    raise exception 'Metadata-only catalog update did not touch updated_at';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.song_platform_links(song_id, platform, market, url)
    values (
      '81000000-0000-4000-8000-000000000001',
      'spotify',
      'CH',
      'https://open.spotify.com.evil.tld/track/1'
    );
    raise exception 'Untrusted streaming host was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.song_catalog(title, artist, isrc)
    values ('Autre titre SQL', 'Autre artiste SQL', 'zzsql2600001');
    raise exception 'Duplicate normalized ISRC was accepted';
  exception
    when unique_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-0000000000a1',
  true
);

do $$
declare
  catalog_row record;
begin
  select * into catalog_row
  from public.search_song_catalog('beyonce test deja', 20, null, null, 'CH')
  where id = '81000000-0000-4000-8000-000000000001';

  if catalog_row.id is null then
    raise exception 'Accent-insensitive catalog search returned no row';
  end if;
  if catalog_row.platform_links ->> 'appleMusic'
      <> 'https://music.apple.com/ch/song/sql-81000001'
    or catalog_row.platform_links ->> 'spotify'
      <> 'https://open.spotify.com/track/sql-81000001'
  then
    raise exception 'Catalog search did not merge CH and global exact links';
  end if;
  if catalog_row.platform_ids ->> 'appleMusic' <> 'sql-apple-81000001' then
    raise exception 'Catalog search lost platform identifiers';
  end if;

  select * into catalog_row
  from public.search_song_catalog(
    'beyonce test deja' || repeat(' ', 200) || 'ignored-after-query-bound',
    20,
    null,
    null,
    'CH'
  )
  where id = '81000000-0000-4000-8000-000000000001';

  if catalog_row.id is null then
    raise exception 'Catalog search did not bound an oversized query';
  end if;

  if exists (
    select 1
    from public.search_song_catalog('deja', 20, 'deja vu', null, 'CH')
  ) or exists (
    select 1
    from public.search_song_catalog(
      'deja',
      20,
      null,
      '81000000-0000-4000-8000-000000000001',
      'CH'
    )
  ) then
    raise exception 'Catalog search accepted an incomplete cursor';
  end if;

  begin
    insert into public.song_catalog(title, artist) values ('Interdit', 'Client');
    raise exception 'Authenticated client obtained catalog write access';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  if exists (select 1 from public.song_catalog) then
    raise exception 'Authenticated role without a user id bypassed catalog RLS';
  end if;
end;
$$;

set local role anon;

do $$
begin
  begin
    perform * from public.search_song_catalog('deja', 20, null, null, 'CH');
    raise exception 'Anon executed the protected catalog search RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;
