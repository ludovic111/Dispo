import { describe, expect, it } from '@jest/globals';

import {
  assertDemoVideoSelection,
  availabilityTripLabel,
  canAddDemoVideo,
  dayKey,
  DEMO_VIDEO_MAX_BYTES,
  demoThumbnailStoragePath,
  demoVideoStoragePath,
  displayDemoTitle,
  normalizeAvailabilityTrip,
  parseAvailabilityTrips,
  parseDemoVideos,
  PortfolioValidationError,
  serializeAvailabilityTrips,
  serializeDemoVideos,
  storagePathFromDemoPublicUrl,
  upsertAvailabilityTrip,
  type AvailabilityTripDraft,
} from '@/features/portfolio/portfolio-model';

const userId = '11111111-1111-4111-8111-111111111111';
const videoId = '22222222-2222-4222-8222-222222222222';
const objectId = '33333333-3333-4333-8333-333333333333';
const tripId = '44444444-4444-4444-8444-444444444444';

describe('portfolio vidéo', () => {
  it('lit et réécrit exactement le JSON historique Swift', () => {
    const raw = [
      {
        date: '2026-08-22',
        id: videoId,
        path: `${userId}/clip.mp4`,
        thumb: 'https://example.supabase.co/storage/v1/object/public/demo-videos/thumb.jpg',
        title: '  Solo au Chat Noir  ',
        url: 'https://example.supabase.co/storage/v1/object/public/demo-videos/clip.mp4',
      },
      {
        id: 'not-a-uuid',
        path: 'foreign/file.mp4',
        url: 'javascript:alert(1)',
      },
    ];
    const videos = parseDemoVideos(raw);
    expect(videos).toEqual([
      {
        date: '2026-08-22',
        id: videoId,
        path: `${userId}/clip.mp4`,
        thumbUrl: 'https://example.supabase.co/storage/v1/object/public/demo-videos/thumb.jpg',
        title: 'Solo au Chat Noir',
        url: 'https://example.supabase.co/storage/v1/object/public/demo-videos/clip.mp4',
      },
    ]);
    expect(serializeDemoVideos(videos)).toEqual([{ ...raw[0], title: 'Solo au Chat Noir' }]);
    expect(displayDemoTitle({ ...videos[0]!, title: null }, 2)).toBe('Vidéo 3');
  });

  it('applique les limites client identiques au trigger serveur', () => {
    expect(canAddDemoVideo(0, false)).toBe(true);
    expect(canAddDemoVideo(1, false)).toBe(false);
    expect(canAddDemoVideo(5, true)).toBe(true);
    expect(canAddDemoVideo(6, true)).toBe(false);

    expect(() =>
      assertDemoVideoSelection({
        durationMs: 181_000,
        fileSize: DEMO_VIDEO_MAX_BYTES,
        mimeType: 'video/mp4',
      }),
    ).not.toThrow();
    expect(() =>
      assertDemoVideoSelection({
        durationMs: 181_001,
        fileSize: DEMO_VIDEO_MAX_BYTES,
        mimeType: 'video/mp4',
      }),
    ).toThrow(new PortfolioValidationError('demo_video_too_long'));
    expect(() =>
      assertDemoVideoSelection({
        durationMs: 10_000,
        fileSize: DEMO_VIDEO_MAX_BYTES + 1,
        mimeType: 'video/mp4',
      }),
    ).toThrow(new PortfolioValidationError('demo_video_too_large'));
    expect(() =>
      assertDemoVideoSelection({ durationMs: 10_000, fileSize: 100, mimeType: 'video/webm' }),
    ).toThrow(new PortfolioValidationError('demo_video_unsupported_type'));
  });

  it('construit uniquement les chemins Storage propriétaires et retrouve une miniature', () => {
    expect(demoVideoStoragePath(userId, objectId, 'mp4')).toBe(`${userId}/${objectId}.mp4`);
    expect(demoThumbnailStoragePath(userId, objectId)).toBe(`${userId}/${objectId}.jpg`);
    expect(() => demoVideoStoragePath('../foreign', objectId, 'mp4')).toThrow(
      new PortfolioValidationError('demo_video_invalid_file'),
    );
    expect(
      storagePathFromDemoPublicUrl(
        `https://example.supabase.co/storage/v1/object/public/demo-videos/${userId}%2Fthumb.jpg?v=1`,
      ),
    ).toBe(`${userId}/thumb.jpg`);
    expect(storagePathFromDemoPublicUrl('https://example.com/other/thumb.jpg')).toBeNull();
  });
});

describe('séjours de disponibilité', () => {
  const draft: AvailabilityTripDraft = {
    city: '  Lisbonne  ',
    country: 'pt',
    from: '2026-09-12',
    id: tripId,
    postalCode: ' 1100-001 ',
    to: '2026-09-20',
  };

  it('normalise pays, code postal, ville et dates dans la forme Swift', () => {
    const trip = normalizeAvailabilityTrip(draft);
    expect(trip).toEqual({
      city: 'Lisbonne',
      country: 'PT',
      from: '2026-09-12',
      id: tripId,
      postalCode: '1100-001',
      to: '2026-09-20',
    });
    expect(availabilityTripLabel(trip)).toBe('1100-001 Lisbonne · PT');
    expect(serializeAvailabilityTrips([trip])).toEqual([
      {
        city: 'Lisbonne',
        country: 'PT',
        from: '2026-09-12',
        id: tripId,
        postal_code: '1100-001',
        to: '2026-09-20',
      },
    ]);
  });

  it('remplace un séjour par id, trie et écarte les anciennes données invalides', () => {
    const first = normalizeAvailabilityTrip({
      ...draft,
      city: 'Paris',
      country: 'FR',
      from: '2026-10-01',
      postalCode: '75011',
      to: '2026-10-02',
    });
    const updated = upsertAvailabilityTrip([first], draft);
    expect(updated).toHaveLength(1);
    expect(updated[0]?.city).toBe('Lisbonne');
    expect(
      parseAvailabilityTrips([
        ...serializeAvailabilityTrips(updated),
        { city: 'Rome', from: '2026-09-20', id: 'bad', to: '2026-09-12' },
      ]),
    ).toEqual(updated);
  });

  it('refuse un lieu incomplet ou une période inversée', () => {
    expect(() => normalizeAvailabilityTrip({ ...draft, postalCode: '' })).toThrow(
      new PortfolioValidationError('trip_invalid_place'),
    );
    expect(() =>
      normalizeAvailabilityTrip({ ...draft, from: '2026-09-21', to: '2026-09-20' }),
    ).toThrow(new PortfolioValidationError('trip_invalid_dates'));
    expect(dayKey(new Date(2026, 7, 31, 23, 30))).toBe('2026-08-31');
  });
});
