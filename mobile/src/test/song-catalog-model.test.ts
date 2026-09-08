import { describe, expect, it } from '@jest/globals';

import type { SongCatalogResult } from '@/features/groups/group-repository';
import {
  emptyGroupSong,
  mergeCatalogEnrichment,
  selectCatalogSong,
} from '@/features/groups/song-catalog-model';

const song = {
  ...emptyGroupSong('song', 'owner', true),
  title: 'My arrangement',
  artist: 'My ensemble',
  albumTitle: 'Time Out',
  artworkUrl: 'https://example.com/cover.jpg',
  genres: ['Jazz'],
  key: 'E♭m',
  tempoBpm: 160,
  platformLinks: { appleMusic: 'https://music.apple.com/recording' },
};
const partial: SongCatalogResult = {
  ...emptyGroupSong('other', 'owner', true),
  catalogId: 'itunes:123',
  title: 'Take Five',
  artist: 'The Dave Brubeck Quartet',
  metadataSource: 'catalog',
  metadataUpdatedAt: '2026-09-08T18:00:00Z',
  platformLinks: { spotify: 'https://open.spotify.com/track/recording' },
};

describe('recording selection and partial enrichment', () => {
  it('keeps known artwork, album, genres, links and personal edits when enrichment is incomplete', () => {
    expect(mergeCatalogEnrichment(song, partial)).toMatchObject({
      title: song.title,
      artist: song.artist,
      albumTitle: 'Time Out',
      artworkUrl: song.artworkUrl,
      genres: ['Jazz'],
      key: 'E♭m',
      tempoBpm: 160,
      platformLinks: { ...song.platformLinks, ...partial.platformLinks },
    });
  });
  it('clears the previous recording metadata when selecting a different recording', () => {
    expect(selectCatalogSong(song, partial)).toMatchObject({
      title: 'Take Five',
      albumTitle: null,
      artworkUrl: null,
      key: null,
      tempoBpm: null,
    });
  });
});
