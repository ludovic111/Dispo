import { describe, expect, it } from '@jest/globals';

import {
  directStreamingDestinations,
  functionalMusicLinks,
  irealAppUrl,
  irealDestination,
  irealSearchUrl,
  isConversationKindVisible,
  songDestinationLabel,
  songsMatch,
  sortedSongDestinations,
  streamingSearchFallbacks,
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

  it('sépare les liens exacts des recherches manquantes dans l’ordre canonique', () => {
    const song = {
      artist: 'Miles Davis',
      platformLinks: {
        apple_music: 'javascript:alert(1)',
        spotify: 'https://open.spotify.com/track/exact',
        youtube: 'https://music.youtube.com/watch?v=exact',
      },
      title: 'So What',
      trackUrl: 'https://music.apple.com/ch/album/so-what/1?i=2',
    };
    const direct = directStreamingDestinations(song);
    const fallbacks = streamingSearchFallbacks(song);

    expect(direct).toEqual([
      {
        kind: 'direct',
        platform: 'appleMusic',
        url: 'https://music.apple.com/ch/album/so-what/1?i=2',
      },
      {
        kind: 'direct',
        platform: 'spotify',
        url: 'https://open.spotify.com/track/exact',
      },
      {
        kind: 'direct',
        platform: 'youtubeMusic',
        url: 'https://music.youtube.com/watch?v=exact',
      },
    ]);
    expect(fallbacks.map(({ platform }) => platform)).toEqual(['deezer', 'tidal', 'amazonMusic']);
    expect(
      fallbacks.every(({ kind, url }) => kind === 'search' && url.startsWith('https://')),
    ).toBe(true);
    expect(fallbacks[0]?.url).toContain('Miles%20Davis%20So%20What');
  });

  it('refuse les pseudo-liens exacts non HTTPS et les réserve aux recherches explicites', () => {
    const song = {
      artist: 'Beyoncé',
      platformLinks: {
        appleMusic: 'http://music.apple.com/insecure',
        spotify: 'spotify:track:not-a-web-fallback',
      },
      title: 'Déjà Vu',
      trackUrl: null,
    };
    const fallbacks = streamingSearchFallbacks(song);

    expect(directStreamingDestinations(song)).toEqual([]);
    expect(fallbacks).toHaveLength(6);
    expect(fallbacks[0]).toEqual(
      expect.objectContaining({ kind: 'search', platform: 'appleMusic' }),
    );
    expect(fallbacks[1]).toEqual(expect.objectContaining({ kind: 'search', platform: 'spotify' }));
    expect(fallbacks[1]?.url).toContain('Beyonc%C3%A9%20D%C3%A9j%C3%A0%20Vu');
  });

  it('refuse les faux domaines, identifiants et ports même sous une clé de service valide', () => {
    const song = {
      artist: 'Herbie Hancock',
      platformLinks: {
        amazonMusic: 'https://music.amazon.com:8443/albums/1',
        deezer: 'https://www.deezer.com.evil.tld/track/1',
        spotify: 'https://open.spotify.com.evil.tld/track/1',
        tidal: 'https://user:password@tidal.com/browse/track/1',
        youtubeMusic: 'https://music.youtube.com:444/watch?v=1',
      },
      title: 'Cantaloupe Island',
      trackUrl: 'https://attacker@music.apple.com/ch/song/1',
    };
    const fallbacks = streamingSearchFallbacks(song);

    expect(directStreamingDestinations(song)).toEqual([]);
    expect(fallbacks).toHaveLength(6);
    expect(fallbacks.find(({ platform }) => platform === 'spotify')?.url).toBe(
      'https://open.spotify.com/search/Herbie%20Hancock%20Cantaloupe%20Island',
    );
  });

  it('accepte seulement les hôtes officiels exacts', () => {
    const song = {
      artist: 'Artist',
      platformLinks: {
        amazonMusic: 'https://music.amazon.com/albums/1?trackAsin=2',
        deezer: 'https://deezer.com/track/1',
        spotify: 'https://open.spotify.com/track/1',
        tidal: 'https://listen.tidal.com/album/1/track/2',
        youtubeMusic: 'https://music.youtube.com/watch?v=1',
      },
      title: 'Title',
      trackUrl: 'https://itunes.apple.com/ch/album/title/id1?i=id2',
    };

    expect(directStreamingDestinations(song)).toHaveLength(6);
    expect(streamingSearchFallbacks(song)).toEqual([]);
  });

  it("ne transforme pas une recherche ou une page d'accueil officielle en lien exact", () => {
    const song = {
      artist: 'Miles Davis',
      platformLinks: {
        amazonMusic: 'https://music.amazon.com/search/So%20What',
        appleMusic: 'https://music.apple.com/ch/search?term=So%20What',
        deezer: 'https://www.deezer.com/search/So%20What',
        spotify: 'https://open.spotify.com/search/So%20What',
        tidal: 'https://tidal.com/search?q=So%20What',
        youtubeMusic: 'https://music.youtube.com/search?q=So%20What',
      },
      title: 'So What',
      trackUrl: null,
    };

    expect(directStreamingDestinations(song)).toEqual([]);
    expect(streamingSearchFallbacks(song)).toHaveLength(6);
  });

  it('accepte le domaine Apple Music géolocalisé officiel', () => {
    const [apple] = directStreamingDestinations({
      artist: 'Miles Davis',
      platformLinks: {},
      title: 'So What',
      trackUrl: 'https://geo.music.apple.com/ch/album/so-what/1?i=2',
    });

    expect(apple).toEqual({
      kind: 'direct',
      platform: 'appleMusic',
      url: 'https://geo.music.apple.com/ch/album/so-what/1?i=2',
    });
  });

  it('conserve un lien exact même sans texte et ne fabrique aucune recherche vide', () => {
    const song = {
      artist: ' ',
      platformLinks: { spotify: 'https://open.spotify.com/track/exact' },
      title: '',
      trackUrl: null,
    };

    expect(directStreamingDestinations(song)).toEqual([
      {
        kind: 'direct',
        platform: 'spotify',
        url: 'https://open.spotify.com/track/exact',
      },
    ]);
    expect(streamingSearchFallbacks(song)).toEqual([]);
  });
});

describe('iReal Pro', () => {
  it('accepte uniquement irealb et irealbook et rattrape les espaces', () => {
    expect(irealAppUrl(' irealbook://Blue Bossa=Composer ')).toBe(
      'irealbook://Blue%20Bossa=Composer',
    );
    expect(irealAppUrl('IREALB://Autumn%20Leaves')).toBe('IREALB://Autumn%20Leaves');
    expect(irealAppUrl('https://example.com/chart')).toBeNull();
  });

  it('encode strictement la recherche locale et remplace un lien invalide', () => {
    expect(irealSearchUrl('  A & B = C + D?#  ')).toBe(
      'irealb://search?A%20%26%20B%20%3D%20C%20%2B%20D%3F%23',
    );
    expect(
      irealDestination({
        irealDisabled: false,
        irealUrl: 'https://example.com/not-ireal',
        title: 'Blue Bossa',
      }),
    ).toEqual({ kind: 'search', url: 'irealb://search?Blue%20Bossa' });
  });

  it('respecte la suppression explicite du lien mais conserve la recherche', () => {
    expect(
      irealDestination({
        irealDisabled: true,
        irealUrl: 'irealbook://Old%20Chart',
        title: 'Nardis',
      }),
    ).toEqual({ kind: 'search', url: 'irealb://search?Nardis' });
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
