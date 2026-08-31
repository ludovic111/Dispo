-- Fixture a charger sur le schema termine par 20260831204632, juste avant
-- 20260831211227_song_apple_storefront_aliases.sql. Il reproduit le doublon
-- observe en production : candidate Apple d'origine + ligne CH enrichie.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '92000000-0000-4000-8000-0000000000a1',
  'authenticated', 'authenticated', 'apple-alias@local.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Apple Alias"}',
  now(), now(), '', '', '', ''
);

insert into public.song_catalog (
  id, title, artist, platform_ids, metadata_source
) values (
  '92000000-0000-4000-8000-000000000001',
  'Apple Music 724502206', '',
  '{"appleMusic":"724502206"}'::jsonb, 'identity-candidate'
), (
  '92000000-0000-4000-8000-000000000002',
  'Cantaloop (Flip Fantasia)', 'Us3',
  '{"appleMusic":"738336150","spotify":"AliasSpotify","youtubeMusic":"AliasYoutube","deezer":"AliasDeezer","tidal":"AliasTidal","amazonMusic":"AliasAmazon"}'::jsonb,
  'odesli'
);

update public.song_catalog
set album_title = 'Hand on the Torch',
    artwork_url = 'https://is1-ssl.mzstatic.com/image/thumb/test/600x600bb.jpg',
    isrc = 'USCA29300101',
    tempo_bpm = 116,
    musical_key = 'Fm',
    duration_ms = 281000,
    genres = array['Jazz Rap'],
    release_year = 1993,
    metadata_updated_at = now()
where id = '92000000-0000-4000-8000-000000000002';

insert into public.song_platform_links (
  song_id, platform, market, url, external_id, source, match_kind
) values
  (
    '92000000-0000-4000-8000-000000000001', 'appleMusic', 'CH',
    'https://music.apple.com/us/song/cantaloop/724502206', '724502206',
    'identity-candidate', 'exact'
  ),
  (
    '92000000-0000-4000-8000-000000000002', 'appleMusic', 'CH',
    'https://music.apple.com/ch/song/cantaloop/738336150', '738336150',
    'odesli', 'exact'
  ),
  (
    '92000000-0000-4000-8000-000000000002', 'spotify', 'CH',
    'https://open.spotify.com/track/AliasSpotify', 'AliasSpotify',
    'odesli', 'exact'
  ),
  (
    '92000000-0000-4000-8000-000000000002', 'youtubeMusic', 'CH',
    'https://music.youtube.com/watch?v=AliasYoutube', 'AliasYoutube',
    'odesli', 'exact'
  ),
  (
    '92000000-0000-4000-8000-000000000002', 'deezer', 'CH',
    'https://www.deezer.com/track/AliasDeezer', 'AliasDeezer',
    'odesli', 'exact'
  ),
  (
    '92000000-0000-4000-8000-000000000002', 'tidal', 'CH',
    'https://listen.tidal.com/track/AliasTidal', 'AliasTidal',
    'odesli', 'exact'
  ),
  (
    '92000000-0000-4000-8000-000000000002', 'amazonMusic', 'CH',
    'https://music.amazon.com/albums/AliasAlbum?trackAsin=AliasAmazon',
    'AliasAmazon', 'odesli', 'exact'
  );

insert into public.music_groups (
  id, name, emoji, leader_id, repertoire
) values (
  '92000000-0000-4000-8000-000000000010', 'Apple alias group', '🎵',
  '92000000-0000-4000-8000-0000000000a1',
  jsonb_build_array(
    jsonb_build_object(
      'id', '92000000-0000-4000-8000-000000000101',
      'title', 'Original arrangement',
      'catalog_id', 'apple:724502206',
      'platform_ids', jsonb_build_object('appleMusic', '724502206'),
      'form', 'AABA'
    ),
    jsonb_build_object(
      'id', '92000000-0000-4000-8000-000000000102',
      'title', 'Storefront arrangement',
      'canonical_song_id', '92000000-0000-4000-8000-000000000002',
      'catalog_id', 'apple:738336150',
      'platform_ids', jsonb_build_object('appleMusic', '738336150'),
      'platform_links', jsonb_build_object(
        'appleMusic', 'https://music.apple.com/ch/song/cantaloop/738336150'
      ),
      'chords', 'Fm7 | Bb7'
    )
  )
);

insert into public.group_events (
  id, group_id, kind, title, venue, date, setlist
) values (
  '92000000-0000-4000-8000-000000000020',
  '92000000-0000-4000-8000-000000000010',
  'Concert', 'Apple alias event', 'Venue', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object(
    'id', '92000000-0000-4000-8000-000000000201',
    'canonical_song_id', '92000000-0000-4000-8000-000000000002',
    'catalog_id', 'apple:738336150',
    'platform_links', jsonb_build_object(
      'appleMusic', 'https://music.apple.com/ch/song/cantaloop/738336150'
    ),
    'title', 'Setlist arrangement'
  ))
);

insert into private.song_enrichment_jobs (
  song_id, state, priority, next_attempt_at, refresh_after, created_at,
  updated_at
) values (
  '92000000-0000-4000-8000-000000000001', 'pending', 10, now(), null,
  now(), now()
), (
  '92000000-0000-4000-8000-000000000002', 'complete', 10,
  now() + interval '30 days', now() + interval '30 days', now(), now()
)
on conflict (song_id) do update
set state = excluded.state,
    priority = excluded.priority,
    attempts = 0,
    next_attempt_at = excluded.next_attempt_at,
    claim_id = null,
    claimed_at = null,
    negative_until = null,
    refresh_after = excluded.refresh_after,
    last_error = null,
    updated_at = excluded.updated_at;
