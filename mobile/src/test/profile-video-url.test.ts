import { describe, expect, it } from '@jest/globals';

import { isPlayableProfileVideoUrl } from '@/features/media/profile-video-url';

describe('profile video URLs', () => {
  it('accepts HTTPS and the explicit local development hosts', () => {
    expect(
      isPlayableProfileVideoUrl('https://example.supabase.co/storage/v1/object/public/a.mp4'),
    ).toBe(true);
    expect(isPlayableProfileVideoUrl('http://127.0.0.1:54321/storage/v1/object/public/a.mp4')).toBe(
      true,
    );
    expect(isPlayableProfileVideoUrl('http://10.0.2.2:54321/storage/v1/object/public/a.mp4')).toBe(
      true,
    );
  });

  it('rejects arbitrary cleartext, non-web and malformed URLs', () => {
    expect(isPlayableProfileVideoUrl('http://example.com/a.mp4')).toBe(false);
    expect(isPlayableProfileVideoUrl('file:///tmp/a.mp4')).toBe(false);
    expect(isPlayableProfileVideoUrl('javascript:alert(1)')).toBe(false);
    expect(isPlayableProfileVideoUrl(undefined)).toBe(false);
  });
});
