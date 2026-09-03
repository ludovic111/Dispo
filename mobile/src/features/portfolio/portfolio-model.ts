import { isPlayableProfileVideoUrl } from '@/features/media/profile-video-url';
import type { Json } from '@/services/supabase/database.types';

export const DEMO_VIDEO_BUCKET = 'demo-videos' as const;
export const DEMO_VIDEO_FREE_LIMIT = 1;
export const DEMO_VIDEO_PREMIUM_LIMIT = 6;
export const DEMO_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const DEMO_VIDEO_MAX_DURATION_MS = 181_000;
export const DEMO_THUMBNAIL_MAX_BYTES = 1024 * 1024;

export interface DemoVideo {
  date: string | null;
  id: string;
  path: string;
  thumbUrl: string | null;
  title: string | null;
  url: string;
}

export interface AvailabilityTrip {
  city: string;
  country: string | null;
  from: string;
  id: string;
  postalCode: string | null;
  to: string;
}

export interface AvailabilityTripDraft {
  city: string;
  country: string;
  from: string;
  id: string;
  postalCode: string;
  to: string;
}

export interface DemoVideoSelectionMetadata {
  durationMs: number | null | undefined;
  fileSize: number | null | undefined;
  mimeType?: string | null | undefined;
}

export type DemoVideoSourceMetadata = Pick<DemoVideoSelectionMetadata, 'durationMs' | 'mimeType'>;

export type PortfolioErrorCode =
  | 'demo_video_invalid_duration'
  | 'demo_video_invalid_file'
  | 'demo_video_too_large'
  | 'demo_video_too_long'
  | 'demo_video_unsupported_type'
  | 'portfolio_limit_reached'
  | 'trip_invalid_dates'
  | 'trip_invalid_place';

export class PortfolioValidationError extends Error {
  readonly code: PortfolioErrorCode;

  constructor(code: PortfolioErrorCode) {
    super(code);
    this.name = 'PortfolioValidationError';
    this.code = code;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const supportedVideoMimeTypes = new Set(['video/mp4', 'video/quicktime']);
const supportedCountryCodes = new Set([
  'AT',
  'AU',
  'BE',
  'BR',
  'CA',
  'CH',
  'CZ',
  'DE',
  'DK',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'IE',
  'IT',
  'JP',
  'KR',
  'LU',
  'MX',
  'NL',
  'NO',
  'NZ',
  'PL',
  'PT',
  'SE',
  'US',
]);

function jsonRecord(value: Json): Record<string, Json | undefined> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value: Json | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalString(value: Json | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function isDayKey(value: string): boolean {
  const match = dayPattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function dayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromDayKey(value: string): Date {
  if (!isDayKey(value)) return new Date();
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 12);
}

export function demoVideoLimit(isPremium: boolean): number {
  return isPremium ? DEMO_VIDEO_PREMIUM_LIMIT : DEMO_VIDEO_FREE_LIMIT;
}

export function canAddDemoVideo(videoCount: number, isPremium: boolean): boolean {
  return videoCount < demoVideoLimit(isPremium);
}

export function assertCanAddDemoVideo(videoCount: number, isPremium: boolean): void {
  if (!canAddDemoVideo(videoCount, isPremium)) {
    throw new PortfolioValidationError('portfolio_limit_reached');
  }
}

export function assertDemoVideoSelection(metadata: DemoVideoSelectionMetadata): void {
  const { durationMs, fileSize, mimeType } = metadata;
  if (!Number.isFinite(fileSize) || (fileSize ?? 0) <= 0) {
    throw new PortfolioValidationError('demo_video_invalid_file');
  }
  if ((fileSize ?? 0) > DEMO_VIDEO_MAX_BYTES) {
    throw new PortfolioValidationError('demo_video_too_large');
  }
  assertDemoVideoSource({ durationMs, mimeType });
}

export function assertDemoVideoSource(metadata: DemoVideoSourceMetadata): void {
  const { durationMs, mimeType } = metadata;
  if (!Number.isFinite(durationMs) || (durationMs ?? 0) <= 0) {
    throw new PortfolioValidationError('demo_video_invalid_duration');
  }
  if ((durationMs ?? 0) > DEMO_VIDEO_MAX_DURATION_MS) {
    throw new PortfolioValidationError('demo_video_too_long');
  }
  if (mimeType && !supportedVideoMimeTypes.has(mimeType.toLocaleLowerCase('en'))) {
    throw new PortfolioValidationError('demo_video_unsupported_type');
  }
}

export function normalizeDemoTitle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';
  return normalized || null;
}

export function displayDemoTitle(video: DemoVideo, index: number): string {
  return video.title ?? `Vidéo ${index + 1}`;
}

export function parseDemoVideos(value: Json): DemoVideo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DemoVideo[] => {
    const record = jsonRecord(entry);
    if (!record) return [];
    const id = nonEmptyString(record.id);
    const path = nonEmptyString(record.path);
    const url = nonEmptyString(record.url);
    if (!id || !isUuid(id) || !path || !url || !isPlayableProfileVideoUrl(url)) return [];
    const date = optionalString(record.date);
    const thumbnail = optionalString(record.thumb);
    return [
      {
        date: date && isDayKey(date) ? date : null,
        id,
        path,
        thumbUrl: isPlayableProfileVideoUrl(thumbnail) ? thumbnail : null,
        title: normalizeDemoTitle(optionalString(record.title)),
        url,
      },
    ];
  });
}

export function serializeDemoVideos(videos: readonly DemoVideo[]): Json[] {
  return videos.map((video) => {
    const payload: Record<string, Json | undefined> = {
      id: video.id,
      path: video.path,
      url: video.url,
    };
    if (video.date) payload.date = video.date;
    if (video.title) payload.title = normalizeDemoTitle(video.title);
    if (video.thumbUrl) payload.thumb = video.thumbUrl;
    return payload;
  });
}

export function parseAvailabilityTrips(value: Json): AvailabilityTrip[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry): AvailabilityTrip[] => {
      const record = jsonRecord(entry);
      if (!record) return [];
      const id = nonEmptyString(record.id);
      const from = nonEmptyString(record.from);
      const to = nonEmptyString(record.to);
      const city = nonEmptyString(record.city);
      if (
        !id ||
        !isUuid(id) ||
        !from ||
        !to ||
        !city ||
        !isDayKey(from) ||
        !isDayKey(to) ||
        from > to
      ) {
        return [];
      }
      const rawCountry = optionalString(record.country)?.toUpperCase() ?? null;
      const country = rawCountry && supportedCountryCodes.has(rawCountry) ? rawCountry : null;
      const postalCode = optionalString(record.postal_code)?.toUpperCase() ?? null;
      return [{ city, country, from, id, postalCode, to }];
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
}

export function normalizeAvailabilityTrip(draft: AvailabilityTripDraft): AvailabilityTrip {
  const city = draft.city.trim().replace(/\s+/g, ' ');
  const postalCode = draft.postalCode.trim().toUpperCase();
  const country = draft.country.trim().toUpperCase();
  if (!city || !postalCode || !supportedCountryCodes.has(country)) {
    throw new PortfolioValidationError('trip_invalid_place');
  }
  if (!isDayKey(draft.from) || !isDayKey(draft.to) || draft.from > draft.to) {
    throw new PortfolioValidationError('trip_invalid_dates');
  }
  return {
    city,
    country,
    from: draft.from,
    id: draft.id,
    postalCode,
    to: draft.to,
  };
}

export function upsertAvailabilityTrip(
  trips: readonly AvailabilityTrip[],
  draft: AvailabilityTripDraft,
): AvailabilityTrip[] {
  const normalized = normalizeAvailabilityTrip(draft);
  return [...trips.filter((trip) => trip.id !== normalized.id), normalized].sort(
    (a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id),
  );
}

export function serializeAvailabilityTrips(trips: readonly AvailabilityTrip[]): Json[] {
  return trips.map((trip) => {
    const payload: Record<string, Json | undefined> = {
      city: trip.city,
      from: trip.from,
      id: trip.id,
      to: trip.to,
    };
    if (trip.country) payload.country = trip.country;
    if (trip.postalCode) payload.postal_code = trip.postalCode;
    return payload;
  });
}

export function availabilityTripLabel(trip: AvailabilityTrip): string {
  const place = [trip.postalCode, trip.city].filter(Boolean).join(' ');
  return trip.country ? `${place} · ${trip.country}` : place;
}

export function demoVideoStoragePath(
  userId: string,
  objectId: string,
  extension: 'mov' | 'mp4',
): string {
  if (!isUuid(userId) || !isUuid(objectId)) {
    throw new PortfolioValidationError('demo_video_invalid_file');
  }
  return `${userId.toLowerCase()}/${objectId.toLowerCase()}.${extension}`;
}

export function demoThumbnailStoragePath(userId: string, objectId: string): string {
  if (!isUuid(userId) || !isUuid(objectId)) {
    throw new PortfolioValidationError('demo_video_invalid_file');
  }
  return `${userId.toLowerCase()}/${objectId.toLowerCase()}.jpg`;
}

export function storagePathFromDemoPublicUrl(value: string | null): string | null {
  if (!value) return null;
  const marker = '/demo-videos/';
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;
  const tail = value.slice(markerIndex + marker.length).split('?')[0];
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return null;
  }
}
