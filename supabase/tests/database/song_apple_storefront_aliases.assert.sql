-- Assertions apres application de 20260831211227_song_apple_storefront_aliases.

do $$
declare
  v_catalog public.song_catalog%rowtype;
  v_original_snapshot jsonb;
  v_event_snapshot jsonb;
  v_archived_snapshot jsonb;
begin
  select * into v_catalog from public.song_catalog
  where id = '92000000-0000-4000-8000-000000000001';
  if v_catalog.id is null
    or v_catalog.platform_ids ->> 'appleMusic' <> '724502206'
    or v_catalog.platform_ids ->> 'spotify' <> 'AliasSpotify'
    or v_catalog.title <> 'Cantaloop (Flip Fantasia)'
    or v_catalog.metadata_source <> 'odesli'
    or v_catalog.tempo_bpm <> 116
    or v_catalog.musical_key <> 'Fm'
  then
    raise exception 'Original canonical catalog did not receive enrichment';
  end if;
  if exists (
    select 1 from public.song_catalog
    where id = '92000000-0000-4000-8000-000000000002'
       or platform_ids ->> 'appleMusic' = '738336150'
  ) then
    raise exception 'Storefront duplicate catalog was not removed';
  end if;
  if (
    select count(*) from public.song_platform_links
    where song_id = '92000000-0000-4000-8000-000000000001'
      and market = 'CH'
  ) <> 6 or exists (
    select 1 from public.song_platform_links
    where song_id = '92000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Verified links were duplicated or lost during reattach';
  end if;
  if (
    select count(*) from private.song_enrichment_jobs
    where song_id in (
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002'
    )
  ) <> 1 or not exists (
    select 1 from private.song_enrichment_jobs
    where song_id = '92000000-0000-4000-8000-000000000001'
      and state = 'complete'
  ) then
    raise exception 'Jobs were not collapsed onto the original UUID';
  end if;
  if private.song_catalog_verified_apple_identities(
    '92000000-0000-4000-8000-000000000001'
  ) <> array['724502206', '738336150']::text[] then
    raise exception 'Canonical and CH alias identities were not preserved';
  end if;

  select repertoire -> 0 into v_original_snapshot
  from public.music_groups
  where id = '92000000-0000-4000-8000-000000000010';
  select setlist -> 0 into v_event_snapshot
  from public.group_events
  where id = '92000000-0000-4000-8000-000000000020';
  select snapshot into v_archived_snapshot
  from private.song_apple_snapshot_merge_archive
  where parent_table = 'music_groups'
    and parent_id = '92000000-0000-4000-8000-000000000010'
    and storefront_song_id = '92000000-0000-4000-8000-000000000002';
  if v_original_snapshot ->> 'canonical_song_id'
      <> '92000000-0000-4000-8000-000000000001'
    or v_original_snapshot -> 'platform_ids' ->> 'appleMusic' <> '724502206'
    or v_original_snapshot ->> 'form' <> 'AABA'
    or (
      select jsonb_array_length(repertoire)
      from public.music_groups
      where id = '92000000-0000-4000-8000-000000000010'
    ) <> 1
    or v_archived_snapshot ->> 'title' <> 'Storefront arrangement'
    or v_archived_snapshot ->> 'chords' <> 'Fm7 | Bb7'
    or v_event_snapshot ->> 'canonical_song_id'
      <> '92000000-0000-4000-8000-000000000001'
    or v_event_snapshot ->> 'title' <> 'Setlist arrangement'
  then
    raise exception 'Repertoire/setlist snapshots were not merged safely';
  end if;
  if exists (
    select 1
    from public.music_groups g
    cross join lateral jsonb_array_elements(g.repertoire) song(value)
    where song.value ->> 'canonical_song_id'
      = '92000000-0000-4000-8000-000000000002'
  ) or exists (
    select 1
    from public.group_events e
    cross join lateral jsonb_array_elements(e.setlist) song(value)
    where song.value ->> 'canonical_song_id'
      = '92000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'A duplicate storefront UUID remains in snapshots';
  end if;
  if private.song_snapshot_matches_catalog(
    jsonb_build_object(
      'canonical_song_id', '92000000-0000-4000-8000-000000000001',
      'catalog_id', 'apple:724502206',
      'platform_links', jsonb_build_object(
        'appleMusic', 'https://music.apple.com/ch/song/cantaloop/738336150'
      )
    ),
    '92000000-0000-4000-8000-000000000001',
    'USCA29300101', '724502206', array['724502206', '738336150']
  ) is not true then
    raise exception 'Verified mixed canonical/storefront identity was rejected';
  end if;
  if private.song_snapshot_matches_catalog(
    jsonb_build_object(
      'canonical_song_id', '92000000-0000-4000-8000-000000000001',
      'catalog_id', 'apple:724502206',
      'platform_links', jsonb_build_object(
        'appleMusic', 'https://music.apple.com/ch/song/wrong/999999999'
      )
    ),
    '92000000-0000-4000-8000-000000000001',
    'USCA29300101', '724502206', array['724502206', '738336150']
  ) is not false then
    raise exception 'Unknown contradictory Apple identity was accepted';
  end if;
end;
$$;
