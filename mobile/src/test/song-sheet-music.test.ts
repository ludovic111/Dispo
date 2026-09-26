import { describe, expect, it } from '@jest/globals';

import { sheetMusicProvider, songsterrSearchUrl } from '@/domain/song';
import { groupSongFromJson, groupSongToJson } from '@/features/groups/group-model';
import { emptyGroupSong, selectCatalogSong } from '@/features/groups/song-catalog-model';

describe('sheet music by song genre', () => {
  it.each(['Jazz', 'Jazz swing', 'Jazz latin', 'Bebop', 'Bossa nova', 'Jazz fusion'])(
    'keeps iReal Pro for %s',
    (genre) => expect(sheetMusicProvider({ genre, genres: [] })).toBe('ireal'),
  );
  it.each(['Rock', 'Alternative Rock', 'Hard Rock', 'Heavy Metal', 'Punk Rock', 'Post-Rock'])(
    'uses Songsterr for %s',
    (genre) => expect(sheetMusicProvider({ genre, genres: [] })).toBe('songsterr'),
  );
  it.each(['Pop', 'Classique', 'Soul', 'Rocksteady', '', null])(
    'does not assign unrelated or missing genres (%s) to either service',
    (genre) => expect(sheetMusicProvider({ genre, genres: [] })).toBeNull(),
  );
  it('uses genre arrays for older records and the primary genre for mixed metadata', () => {
    expect(sheetMusicProvider({ genre: null, genres: ['Music', ' Rock '] })).toBe('songsterr');
    expect(sheetMusicProvider({ genre: 'Jazz', genres: ['Rock', 'Jazz'] })).toBe('ireal');
    expect(sheetMusicProvider({ genre: 'Rock', genres: ['Jazz'] })).toBe('songsterr');
  });
  it('honors the personal style even when the catalog says something else', () => {
    const jazz = { genre: 'Jazz', genres: ['Jazz'] };
    expect(sheetMusicProvider(jazz, 'Rock')).toBe('songsterr');
    expect(sheetMusicProvider(jazz, 'Pop')).toBeNull();
    expect(sheetMusicProvider(jazz, '')).toBe('ireal');
  });
  it('preserves the provider across catalog selection and stored group/setlist snapshots', () => {
    const base = emptyGroupSong('ec071bbb-0028-45aa-b995-2bc9e00ee380', 'owner', true);
    const selected = selectCatalogSong(base, {
      ...base,
      title: 'Back in Black',
      artist: 'AC/DC',
      genre: 'Rock',
      genres: ['Rock'],
      catalogId: 'itunes:123',
      canonicalSongId: null,
      metadataSource: 'itunes',
      metadataUpdatedAt: '2026-09-26T00:00:00Z',
    });
    const restored = groupSongFromJson(groupSongToJson(selected));
    expect(restored).not.toBeNull();
    expect(sheetMusicProvider(restored!)).toBe('songsterr');
  });
  it('encodes title and artist as one search parameter on the official website', () => {
    const url = new URL(
      songsterrSearchUrl({ artist: ' AC/DC ', title: ' Back in Black & more? ' })!,
    );
    expect(url.origin).toBe('https://www.songsterr.com');
    expect([...url.searchParams]).toEqual([['pattern', 'AC/DC Back in Black & more?']]);
    expect(songsterrSearchUrl({ artist: '', title: 'Creep' })).toBe(
      'https://www.songsterr.com/?pattern=Creep',
    );
    expect(songsterrSearchUrl({ artist: 'Radiohead', title: ' ' })).toBeNull();
  });
});
