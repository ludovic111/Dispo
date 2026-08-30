import { describe, expect, it } from '@jest/globals';

import {
  functionalMusicLinks,
  isConversationKindVisible,
  songDestinationLabel,
  songsMatch,
  sortedSongDestinations,
  type CanonicalSong,
  type SongDestination,
} from '@/domain/song';

const canonicalSong: CanonicalSong = {
  artist: 'Herbie Hancock',
  isrc: 'USSM-65-00001',
  title: 'Cantaloupe Island',
};

describe('liens musicaux', () => {
  it('ne conserve que les liens HTTPS fonctionnels et leur ordre', () => {
    expect(
      functionalMusicLinks([
        { platform: 'Apple Music', url: 'https://music.apple.com/song/1' },
        { platform: 'Spotify', url: 'HTTP://open.spotify.com/track/1' },
        { platform: 'YouTube Music', url: 'HTTPS://music.youtube.com/watch?v=1' },
        { platform: 'Deezer', url: '' },
      ]),
    ).toEqual([
      { platform: 'Apple Music', url: 'https://music.apple.com/song/1' },
      { platform: 'YouTube Music', url: 'HTTPS://music.youtube.com/watch?v=1' },
    ]);
  });
});

describe('déduplication des morceaux', () => {
  it('priorise un ISRC normalisé', () => {
    expect(
      songsMatch(canonicalSong, {
        artist: 'Autre artiste',
        isrc: 'ussm6500001',
        title: 'Autre titre',
      }),
    ).toBe(true);
    expect(songsMatch(canonicalSong, { ...canonicalSong, isrc: 'FR-AAA-26-00001' })).toBe(false);
  });

  it('utilise artiste et titre normalisés lorsque l’ISRC manque', () => {
    expect(
      songsMatch(
        { artist: 'Beyoncé', isrc: null, title: '  Déjà   Vu ' },
        { artist: ' beyonce ', isrc: null, title: 'deja vu' },
      ),
    ).toBe(true);
    expect(
      songsMatch(
        { artist: 'Beyoncé', isrc: null, title: 'Déjà Vu' },
        { artist: 'Beyoncé', isrc: null, title: 'Halo' },
      ),
    ).toBe(false);
  });

  it('permet d’identifier un morceau déjà présent avant toute copie', () => {
    const existingSongs = [canonicalSong];
    const sameSong = { ...canonicalSong, isrc: 'USSM6500001' };
    const newSong = { artist: 'Wayne Shorter', isrc: null, title: 'Footprints' };

    expect(existingSongs.some((song) => songsMatch(song, sameSong))).toBe(true);
    expect(existingSongs.some((song) => songsMatch(song, newSong))).toBe(false);
  });
});

describe('copie d’un morceau', () => {
  const destinations: SongDestination[] = [
    {
      date: null,
      groupName: 'Blue Notes',
      id: 'repertoire-1',
      name: 'Répertoire principal',
      type: 'Répertoire',
    },
    {
      date: '2026-10-10T18:00:00.000Z',
      groupName: 'Blue Notes',
      id: 'event-later',
      name: 'Automne jazz',
      type: 'Concert',
    },
    {
      date: '2026-09-05T12:00:00.000Z',
      groupName: 'Blue Notes',
      id: 'event-sooner',
      name: 'Répétition générale',
      type: 'Répétition',
    },
  ];

  it('affiche le nom, la date complète, le type et le groupe avant validation', () => {
    const label = songDestinationLabel(destinations[2]!, 'fr-CH');

    expect(label).toContain('Répétition générale');
    expect(label).toContain('5 septembre 2026');
    expect(label).toContain('Répétition');
    expect(label).toContain('Blue Notes');
  });

  it('gère les destinations sans date et trie sans modifier l’entrée', () => {
    const originalOrder = destinations.map((destination) => destination.id);
    const sorted = sortedSongDestinations(destinations);

    expect(songDestinationLabel(destinations[0]!, 'fr-CH')).toContain('Sans date');
    expect(sorted.map((destination) => destination.id)).toEqual([
      'event-sooner',
      'event-later',
      'repertoire-1',
    ]);
    expect(destinations.map((destination) => destination.id)).toEqual(originalOrder);
  });
});

describe('suppression des discussions d’école', () => {
  it('masque les conversations scolaires sans masquer les groupes de musique ordinaires', () => {
    expect(isConversationKindVisible('school')).toBe(false);
    expect(isConversationKindVisible('music-group')).toBe(true);
    expect(isConversationKindVisible('direct')).toBe(true);
  });
});
