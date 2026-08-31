import { describe, expect, it } from '@jest/globals';

import { isSafeSongPreviewUrl, normalizeSongAnalysis } from '../../modules/dispo-song-analysis';

describe('analyse locale des extraits musicaux', () => {
  it('garde uniquement des propositions de tonalité et tempo plausibles', () => {
    expect(normalizeSongAnalysis({ key: ' B♭m ', tempoBpm: 119.6 })).toEqual({
      key: 'B♭m',
      tempoBpm: 120,
    });
    expect(normalizeSongAnalysis({ key: '', tempoBpm: 12 })).toEqual({
      key: null,
      tempoBpm: null,
    });
    expect(normalizeSongAnalysis({ key: 'not-a-key', tempoBpm: Number.POSITIVE_INFINITY })).toEqual(
      {
        key: null,
        tempoBpm: null,
      },
    );
  });

  it('accepte uniquement un aperçu HTTPS public sans identifiants', () => {
    expect(
      isSafeSongPreviewUrl(
        'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/example.m4a',
      ),
    ).toBe(true);
    expect(isSafeSongPreviewUrl('http://audio-ssl.itunes.apple.com/preview.m4a')).toBe(false);
    expect(isSafeSongPreviewUrl('https://user:password@example.com/preview.m4a')).toBe(false);
    expect(isSafeSongPreviewUrl('https://127.0.0.1/preview.m4a')).toBe(false);
    expect(isSafeSongPreviewUrl('https://catalog.local/preview.m4a')).toBe(false);
    expect(isSafeSongPreviewUrl('https://example.com:8443/preview.m4a')).toBe(false);
  });
});
