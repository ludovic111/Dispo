-- Tests transactionnels de la file d'enrichissement serveur.
--   docker exec -i supabase_db_dispo \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/database/song_enrichment_queue.test.sql

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '91000000-0000-4000-8000-0000000000a1',
  'authenticated', 'authenticated', 'enrichment@local.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Enrichment"}',
  now(), now(), '', '', '', ''
);

set local role postgres;

insert into public.song_catalog (
  id, title, artist, album_title, artwork_url, isrc, duration_ms, genres,
  release_year, platform_ids, metadata_source
) values (
  '91000000-0000-4000-8000-000000000001',
  'Canonical title', 'Canonical artist', 'Canonical album',
  'https://is1-ssl.mzstatic.com/image/thumb/test/600x600bb.jpg',
  'ZZ-ENR-26-00001', 210000, array['Jazz'], 2026,
  '{"appleMusic":"9100001"}'::jsonb, 'sql-test'
);

insert into public.song_platform_links (
  song_id, platform, market, url, external_id, source
) values (
  '91000000-0000-4000-8000-000000000001', 'appleMusic', 'CH',
  'https://music.apple.com/ch/song/canonical/9100001', '9100001', 'sql-test'
);

insert into public.music_groups (
  id, name, emoji, leader_id, repertoire
) values (
  '91000000-0000-4000-8000-000000000010', 'Enrichment group', '🎵',
  '91000000-0000-4000-8000-0000000000a1',
  jsonb_build_array(
    jsonb_build_object(
      'id', '91000000-0000-4000-8000-000000000101',
      'title', 'Arrangement title',
      'artist', 'Arrangement artist',
      'catalog_id', 'apple:9100001',
      'suggested_by', 'Leader',
      'is_approved', true,
      'form', 'AABA',
      'chords', 'Custom changes',
      'ireal_url', 'irealb://custom',
      'platform_links', jsonb_build_object(
        'spotify', 'https://open.spotify.com/track/ExistingSnapshot123'
      )
    ),
    jsonb_build_object(
      'id', '91000000-0000-4000-8000-000000000102',
      'title', 'Private manual song',
      'artist', 'Private artist',
      'suggested_by', 'Leader',
      'is_approved', true,
      'key', 'Cm'
    )
  )
);

insert into public.group_events (
  id, group_id, kind, title, venue, date, setlist
) values (
  '91000000-0000-4000-8000-000000000020',
  '91000000-0000-4000-8000-000000000010',
  'Concert', 'Enrichment event', 'Venue', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object(
    'id', '91000000-0000-4000-8000-000000000201',
    'canonical_song_id', '91000000-0000-4000-8000-000000000001',
    'title', 'Setlist title',
    'artist', 'Setlist artist',
    'suggested_by', 'Leader',
    'is_approved', true
  ))
);

update public.music_groups
set repertoire = jsonb_set(
  jsonb_set(
    repertoire,
    '{0,platform_ids}',
    '{"appleMusic":"9100001","spotify":"ClientPoison"}'::jsonb
  ),
  '{0,artwork_url}',
  '"https://evil.example/client-artwork.jpg"'::jsonb
)
where id = '91000000-0000-4000-8000-000000000010';

do $$
declare
  v_catalog public.song_catalog%rowtype;
begin
  select * into v_catalog from public.song_catalog
  where id = '91000000-0000-4000-8000-000000000001';
  if v_catalog.platform_ids ? 'spotify'
    or v_catalog.artwork_url <>
      'https://is1-ssl.mzstatic.com/image/thumb/test/600x600bb.jpg'
  then
    raise exception 'A user snapshot poisoned canonical catalog metadata';
  end if;
end;
$$;

do $$
begin
  if not private.song_snapshot_matches_catalog(
    '{"platform_ids":{"appleMusic":"9100001"}}'::jsonb,
    '91000000-0000-4000-8000-000000000001', null, '9100001'
  ) then
    raise exception 'Apple platform_ids snapshot identity was not recognized';
  end if;
  if private.song_snapshot_matches_catalog(
    '{"canonical_song_id":"91000000-0000-4000-8000-000000000099","isrc":"ZZENR2600001","catalog_id":"apple:9100001"}'::jsonb,
    '91000000-0000-4000-8000-000000000001', 'ZZENR2600001', '9100001'
  ) then
    raise exception 'A contradictory canonical UUID was accepted by OR matching';
  end if;
  if private.sync_song_catalog_snapshot(
    '{"canonical_song_id":"91000000-0000-4000-8000-000000000099","isrc":"ZZENR2600001","catalog_id":"apple:9100001","title":"Poison"}'::jsonb
  ) is not null then
    raise exception 'A contradictory snapshot was synchronized by fallback';
  end if;
  if not private.enqueue_song_enrichment_internal(
    '91000000-0000-4000-8000-000000000001', null, 10::smallint
  ) then
    -- Le trigger de synchronisation peut avoir créé la ligne avant cet appel.
    if not exists (
      select 1 from private.song_enrichment_jobs
      where song_id = '91000000-0000-4000-8000-000000000001'
        and state = 'pending'
    ) then
      raise exception 'Idempotent enqueue did not create a pending job';
    end if;
  end if;
  if private.enqueue_song_enrichment_internal(
    '91000000-0000-4000-8000-000000000001', null, 10::smallint
  ) then
    raise exception 'Idempotent enqueue created a duplicate';
  end if;
  if private.sync_song_catalog_snapshot(
    '{"title":"Private only","artist":"Secret","key":"Fm"}'::jsonb
  ) is not null then
    raise exception 'A manual private song entered the public catalog';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '91000000-0000-4000-8000-0000000000a1', true
);

do $$
begin
  perform public.enqueue_song_enrichment(
    '91000000-0000-4000-8000-000000000001'
  );
  if public.enqueue_song_enrichment(
    '91000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Five-minute user deduplication returned true';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.claim_song_enrichment_jobs(uuid,integer,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.reserve_song_enrichment_provider_call(uuid)',
    'EXECUTE'
  ) or has_table_privilege(
    'authenticated', 'private.song_enrichment_jobs', 'SELECT'
  ) then
    raise exception 'Authenticated role can reach the private worker queue';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  v_claimed record;
  v_index integer;
begin
  select * into v_claimed
  from public.claim_song_enrichment_jobs(
    '91000000-0000-4000-8000-0000000000c1', 99,
    '91000000-0000-4000-8000-000000000001'
  );
  if v_claimed.song_id <> '91000000-0000-4000-8000-000000000001'
    or v_claimed.attempt_number <> 1
  then
    raise exception 'Targeted bounded claim returned the wrong job';
  end if;
  for v_index in 1..5 loop
    if not public.reserve_song_enrichment_provider_call(v_claimed.song_id) then
      raise exception 'Provider reservation % was unexpectedly rejected', v_index;
    end if;
  end loop;
  if public.reserve_song_enrichment_provider_call(v_claimed.song_id) then
    raise exception 'Sixth provider call was allowed inside sixty seconds';
  end if;
end;
$$;

select public.complete_song_enrichment_job(
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-0000000000c1',
  jsonb_build_object(
    'source', 'odesli+musicfetch',
    'isrc', 'ZZENR2600001',
    'tempo_bpm', 127,
    'musical_key', 'F#m',
    'platform_ids', jsonb_build_object(
      'appleMusic', '9100091',
      'spotify', '3n3Ppam7vgaVa1iaRUc9Lp',
      'youtubeMusic', 'LXkpWY5Y02Q',
      'deezer', '1398706592',
      'tidal', '186994102',
      'amazonMusic', 'B096WQDK25'
    ),
    'links', jsonb_build_array(
      jsonb_build_object(
        'platform', 'appleMusic', 'market', 'CH',
        'url', 'https://music.apple.com/ch/song/canonical/9100091',
        'external_id', '9100091'
      ),
      jsonb_build_object(
        'platform', 'spotify', 'market', 'CH',
        'url', 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
        'external_id', '3n3Ppam7vgaVa1iaRUc9Lp'
      ),
      jsonb_build_object(
        'platform', 'youtubeMusic', 'market', 'CH',
        'url', 'https://music.youtube.com/watch?v=LXkpWY5Y02Q',
        'external_id', 'LXkpWY5Y02Q'
      ),
      jsonb_build_object(
        'platform', 'deezer', 'market', 'CH',
        'url', 'https://www.deezer.com/track/1398706592',
        'external_id', '1398706592'
      ),
      jsonb_build_object(
        'platform', 'tidal', 'market', 'CH',
        'url', 'https://listen.tidal.com/track/186994102',
        'external_id', '186994102'
      ),
      jsonb_build_object(
        'platform', 'amazonMusic', 'market', 'CH',
        'url', 'https://music.amazon.com/albums/B096WRT98Y?trackAsin=B096WQDK25',
        'external_id', 'B096WQDK25'
      )
    )
  )
);

set local role postgres;

do $$
declare
  v_catalog record;
  v_song jsonb;
  v_private jsonb;
  v_event_song jsonb;
begin
  select * into v_catalog from public.song_catalog
  where id = '91000000-0000-4000-8000-000000000001';
  if v_catalog.tempo_bpm <> 127 or v_catalog.musical_key <> 'F#m'
    or v_catalog.metadata_source <> 'odesli+musicfetch'
    or v_catalog.platform_ids ->> 'appleMusic' <> '9100001'
  then
    raise exception 'Catalog lost audioMetrics or original canonical Apple ID';
  end if;
  if private.song_catalog_verified_apple_identities(v_catalog.id)
      <> array['9100001', '9100091']::text[]
    or not exists (
      select 1 from public.song_platform_links
      where song_id = v_catalog.id
        and platform = 'appleMusic'
        and external_id = '9100091'
        and url = 'https://music.apple.com/ch/song/canonical/9100091'
    )
  then
    raise exception 'Verified Apple storefront alias was not recorded';
  end if;
  if (
    select count(*) from public.song_platform_links
    where song_id = '91000000-0000-4000-8000-000000000001'
      and market = 'CH'
  ) <> 6 then
    raise exception 'Catalog does not contain the six exact service links';
  end if;

  select repertoire -> 0, repertoire -> 1 into v_song, v_private
  from public.music_groups
  where id = '91000000-0000-4000-8000-000000000010';
  if v_song ->> 'title' <> 'Arrangement title'
    or v_song ->> 'artist' <> 'Arrangement artist'
    or v_song ->> 'form' <> 'AABA'
    or v_song ->> 'chords' <> 'Custom changes'
    or v_song ->> 'ireal_url' <> 'irealb://custom'
  then
    raise exception 'Snapshot propagation overwrote user arrangement fields';
  end if;
  if v_song ->> 'canonical_song_id'
      <> '91000000-0000-4000-8000-000000000001'
    or v_song ->> 'key' <> 'F#m'
    or (v_song ->> 'tempo_bpm')::integer <> 127
    or v_song -> 'platform_links' ->> 'tidal'
      <> 'https://listen.tidal.com/track/186994102'
    or v_song -> 'platform_links' ->> 'spotify'
      <> 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp'
    or v_song -> 'platform_ids' ->> 'spotify'
      <> '3n3Ppam7vgaVa1iaRUc9Lp'
    or v_song -> 'platform_ids' ->> 'appleMusic' <> '9100001'
    or v_song -> 'platform_links' ->> 'appleMusic'
      <> 'https://music.apple.com/ch/song/canonical/9100091'
    or v_song ->> 'artwork_url'
      <> 'https://is1-ssl.mzstatic.com/image/thumb/test/600x600bb.jpg'
  then
    raise exception 'Snapshot propagation lost identity, metadata or link merge';
  end if;
  if v_private ? 'canonical_song_id' or v_private ? 'platform_links'
    or v_private ->> 'key' <> 'Cm'
  then
    raise exception 'Private manual song was modified by catalog propagation';
  end if;

  select setlist -> 0 into v_event_song
  from public.group_events
  where id = '91000000-0000-4000-8000-000000000020';
  if v_event_song ->> 'title' <> 'Setlist title'
    or v_event_song ->> 'key' <> 'F#m'
    or v_event_song -> 'platform_links' ->> 'amazonMusic'
      <> 'https://music.amazon.com/albums/B096WRT98Y?trackAsin=B096WQDK25'
  then
    raise exception 'Setlist snapshot did not receive safe enrichment';
  end if;
  if not private.song_snapshot_matches_catalog(
    jsonb_build_object(
      'canonical_song_id', v_catalog.id::text,
      'catalog_id', 'apple:9100001',
      'platform_links', jsonb_build_object(
        'appleMusic', 'https://music.apple.com/ch/song/canonical/9100091'
      )
    ),
    v_catalog.id, v_catalog.normalized_isrc, '9100001',
    private.song_catalog_verified_apple_identities(v_catalog.id)
  ) then
    raise exception 'Canonical Apple ID plus verified CH alias did not match';
  end if;
  if private.song_snapshot_matches_catalog(
    jsonb_build_object(
      'canonical_song_id', v_catalog.id::text,
      'catalog_id', 'apple:9100001',
      'platform_links', jsonb_build_object(
        'appleMusic', 'https://music.apple.com/ch/song/wrong/9999991'
      )
    ),
    v_catalog.id, v_catalog.normalized_isrc, '9100001',
    private.song_catalog_verified_apple_identities(v_catalog.id)
  ) then
    raise exception 'An unknown contradictory Apple alias was accepted';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '91000000-0000-4000-8000-0000000000a1', true
);

select public.enqueue_song_enrichment_candidate(
  'https://music.apple.com/ch/album/verified/9100099?i=9100009',
  '9100009'
);

do $$
begin
  if exists (
    select 1 from public.song_catalog
    where platform_ids ->> 'appleMusic' = '9100009'
  ) then
    raise exception 'An unverified identity candidate escaped catalog RLS';
  end if;
end;
$$;

set local role service_role;
select * from public.claim_song_enrichment_jobs(
  '91000000-0000-4000-8000-0000000000c9', 1,
  (select id from public.song_catalog
   where platform_ids ->> 'appleMusic' = '9100009')
);
select public.complete_song_enrichment_job(
  (select id from public.song_catalog
   where platform_ids ->> 'appleMusic' = '9100009'),
  '91000000-0000-4000-8000-0000000000c9',
  jsonb_build_object(
    'source', 'odesli',
    'title', 'Verified provider title',
    'artist', 'Verified provider artist',
    'artwork_url',
      'https://is1-ssl.mzstatic.com/image/thumb/verified/600x600bb.jpg',
    'duration_ms', 190000,
    'genres', jsonb_build_array('Jazz'),
    'release_year', 2026,
    'platform_ids', jsonb_build_object('appleMusic', '9100009'),
    'links', jsonb_build_array(jsonb_build_object(
      'platform', 'appleMusic', 'market', 'CH',
      'url', 'https://music.apple.com/ch/album/verified/9100099?i=9100009',
      'external_id', '9100009'
    ))
  )
);

set local role authenticated;
do $$
declare
  v_candidate public.song_catalog%rowtype;
begin
  select * into v_candidate from public.song_catalog
  where platform_ids ->> 'appleMusic' = '9100009';
  if v_candidate.id is null
    or v_candidate.title <> 'Verified provider title'
    or v_candidate.artist <> 'Verified provider artist'
    or v_candidate.metadata_source <> 'odesli'
  then
    raise exception 'Verified candidate was not published with provider data';
  end if;
end;
$$;

set local role postgres;

-- Un résultat fournisseur invalide doit échouer sans modifier la fiche.
insert into public.song_catalog (
  id, title, artist, isrc, platform_ids
) values (
  '91000000-0000-4000-8000-000000000002', 'Invalid result', 'Artist',
  'ZZ-ENR-26-00002', '{"appleMusic":"9100002"}'::jsonb
);
select private.enqueue_song_enrichment_internal(
  '91000000-0000-4000-8000-000000000002', null, 10::smallint
);
select * from public.claim_song_enrichment_jobs(
  '91000000-0000-4000-8000-0000000000c2', 1,
  '91000000-0000-4000-8000-000000000002'
);

do $$
begin
  begin
    perform public.complete_song_enrichment_job(
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-0000000000c2',
      '{"source":"odesli","platform_ids":{"spotify":"WrongTrack123"},"links":[{"platform":"spotify","market":"CH","url":"https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp","external_id":"WrongTrack123"}]}'::jsonb
    );
    raise exception 'A platform ID different from the direct URL was accepted';
  exception
    when check_violation or invalid_parameter_value then null;
  end;
  begin
    perform public.complete_song_enrichment_job(
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-0000000000c2',
      '{"source":"musicfetch","tempo_bpm":401,"platform_ids":{},"links":[{"platform":"spotify","market":"CH","url":"https://evil.example/track/1","external_id":"1"}]}'::jsonb
    );
    raise exception 'Invalid provider result was accepted';
  exception
    when check_violation or invalid_parameter_value then null;
  end;
  if not public.finish_song_enrichment_job(
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-0000000000c2',
    'negative', 'not_found', null
  ) then
    raise exception 'Negative result did not close the active claim';
  end if;
  if private.enqueue_song_enrichment_internal(
    '91000000-0000-4000-8000-000000000002', null, 10::smallint
  ) then
    raise exception 'Negative cache allowed an immediate re-enqueue';
  end if;
end;
$$;

-- Un report sans appel HTTP ne doit jamais épuiser les huit tentatives.
insert into public.song_catalog (
  id, title, artist, isrc, platform_ids
) values (
  '91000000-0000-4000-8000-000000000004', 'Deferred result', 'Artist',
  'ZZ-ENR-26-00004', '{"appleMusic":"9100004"}'::jsonb
);
select private.enqueue_song_enrichment_internal(
  '91000000-0000-4000-8000-000000000004', null, 10::smallint
);
update private.song_enrichment_jobs
set attempts = 7, next_attempt_at = now()
where song_id = '91000000-0000-4000-8000-000000000004';

set local role service_role;
select * from public.claim_song_enrichment_jobs(
  '91000000-0000-4000-8000-0000000000d1', 1,
  '91000000-0000-4000-8000-000000000004'
);
select public.release_song_enrichment_claim(
  '91000000-0000-4000-8000-0000000000d1'
);

set local role postgres;
do $$
declare
  v_job private.song_enrichment_jobs%rowtype;
begin
  select * into v_job from private.song_enrichment_jobs
  where song_id = '91000000-0000-4000-8000-000000000004';
  if v_job.state <> 'pending' or v_job.attempts <> 7 then
    raise exception 'A provider quota deferral consumed an attempt';
  end if;
end;
$$;
update private.song_enrichment_jobs set next_attempt_at = now()
where song_id = '91000000-0000-4000-8000-000000000004';

set local role service_role;
do $$
declare
  v_attempt integer;
begin
  select attempt_number into v_attempt
  from public.claim_song_enrichment_jobs(
    '91000000-0000-4000-8000-0000000000d2', 1,
    '91000000-0000-4000-8000-000000000004'
  );
  if v_attempt <> 8 then
    raise exception 'The released job was no longer claimable';
  end if;
  perform public.release_song_enrichment_claim(
    '91000000-0000-4000-8000-0000000000d2'
  );
end;
$$;

set local role postgres;

rollback;
