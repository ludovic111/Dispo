import type { GroupSong } from './group-model';
import type { SongCatalogResult } from './group-repository';

/** Selecting a different recording must not retain the previous recording's key or BPM. */
export function selectCatalogSong(base: GroupSong, item: SongCatalogResult): GroupSong {
  return { ...base, ...item, key: item.key, tempoBpm: item.tempoBpm };
}

export function mergeCatalogEnrichment(song: GroupSong, item: SongCatalogResult): GroupSong {
  const { title: _title, artist: _artist, key: _key, tempoBpm: _tempo, ...metadata } = item;
  // Providers often return partial records; missing fields are not deletions.
  const availableMetadata = Object.fromEntries(
    Object.entries(metadata).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== '' &&
        (!Array.isArray(value) || value.length > 0),
    ),
  );
  return {
    ...song,
    ...availableMetadata,
    platformIds: { ...song.platformIds, ...item.platformIds },
    platformLinks: { ...song.platformLinks, ...item.platformLinks },
    key: song.key?.trim() ? song.key : item.key,
    tempoBpm: song.tempoBpm ?? item.tempoBpm,
  };
}

export function emptyGroupSong(id: string, userId: string, approved: boolean): GroupSong {
  return {
    albumTitle: null,
    artist: '',
    artworkUrl: null,
    catalogId: null,
    canonicalSongId: null,
    chords: null,
    composer: null,
    durationMilliseconds: null,
    form: null,
    genre: null,
    genres: [],
    id,
    irealDisabled: false,
    irealUrl: null,
    isrc: null,
    isApproved: approved,
    key: null,
    metadataSource: null,
    metadataUpdatedAt: null,
    platformIds: {},
    platformLinks: {},
    previewUrl: null,
    releaseYear: null,
    solos: [],
    suggestedBy: userId,
    tempoBpm: null,
    title: '',
    trackUrl: null,
  };
}
