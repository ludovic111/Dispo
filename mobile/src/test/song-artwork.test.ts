import { describe, expect, it } from '@jest/globals';

import { appleArtworkPromotion, type ArtworkSong } from '@/domain/song-artwork';

const song: ArtworkSong = {
  title: 'Autumn Leaves',
  artist: 'Example artist',
  artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/example/100x100bb.jpg',
  platformLinks: {},
  trackUrl: 'https://music.apple.com/ch/album/example/123?i=456',
};

describe('Apple promotional artwork', () => {
  it('retains the recording identity in the direct purchase link', () => {
    const promotion = appleArtworkPromotion(song);
    expect(promotion?.artworkUrl).toBe(song.artworkUrl);
    const url = new URL(promotion!.storeUrl);
    expect(url.hostname).toBe('itunes.apple.com');
    expect(url.pathname).toBe('/ch/album/example/123');
    expect(url.searchParams.get('i')).toBe('456');
    expect(url.searchParams.get('app')).toBe('itunes');
  });

  it.each([
    'https://example.com/cover.jpg',
    'https://is1-ssl.mzstatic.com.example.com/cover.jpg',
    'https://user:pass@is1-ssl.mzstatic.com/cover.jpg',
    'http://is1-ssl.mzstatic.com/cover.jpg',
  ])('does not display untrusted artwork: %s', (artworkUrl) => {
    expect(appleArtworkPromotion({ ...song, artworkUrl })).toBeNull();
  });

  it.each([null, 'https://music.apple.com/ch/search?term=jazz', 'https://example.com/song/456'])(
    'does not display artwork without a direct Apple destination: %s',
    (trackUrl) => {
      expect(appleArtworkPromotion({ ...song, trackUrl })).toBeNull();
    },
  );

  it('also supports canonical catalogue platform links', () => {
    expect(
      appleArtworkPromotion({
        ...song,
        trackUrl: null,
        platformLinks: { appleMusic: song.trackUrl! },
      }),
    ).not.toBeNull();
  });
});
