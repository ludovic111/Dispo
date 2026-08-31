export const postalCodeMinLength = 3;
export const postalCodeMaxLength = 10;

export interface PostalPlaceDraft {
  city: string;
  countryCode: string;
  postalCode: string;
}

export interface PostalAddressCandidate {
  city: string | null;
  country: string | null;
  district: string | null;
  isoCountryCode: string | null;
  name: string | null;
  postalCode: string | null;
  region: string | null;
  subregion: string | null;
}

export interface PostalCoordinates {
  latitude: number;
  longitude: number;
}

export interface ResolvedPostalPlace extends PostalPlaceDraft, PostalCoordinates {
  countryName: string | null;
  source: 'native-geocoder';
}

export type PostalPlaceResolutionState =
  | { place: null; status: 'idle' }
  | { place: null; status: 'waiting' }
  | { place: null; status: 'resolving' }
  | { place: null; status: 'not-found' }
  | { place: null; status: 'unavailable' }
  | { place: ResolvedPostalPlace; status: 'resolved' };

export const idlePostalPlaceResolution: PostalPlaceResolutionState = {
  place: null,
  status: 'idle',
};

export function normalizePostalCode(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeCountryCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCity(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizePostalPlaceDraft(value: PostalPlaceDraft): PostalPlaceDraft {
  return {
    city: normalizeCity(value.city),
    countryCode: normalizeCountryCode(value.countryCode),
    postalCode: normalizePostalCode(value.postalCode),
  };
}

/**
 * Mirrors the native client: international postal codes may be numeric or
 * alphanumeric, so plausibility is deliberately limited to a length guard.
 */
export function isPlausiblePostalCode(value: string): boolean {
  const postalCode = normalizePostalCode(value);
  return postalCode.length >= postalCodeMinLength && postalCode.length <= postalCodeMaxLength;
}

export function canResolvePostalPlace(
  value: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'>,
): boolean {
  return (
    normalizeCountryCode(value.countryCode).length === 2 && isPlausiblePostalCode(value.postalCode)
  );
}

export function postalPlaceCacheKey(
  value: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'>,
): string {
  return `${normalizeCountryCode(value.countryCode)}-${normalizePostalCode(value.postalCode)}`;
}

export function formatPostalPlace(value: PostalPlaceDraft): string {
  const place = normalizePostalPlaceDraft(value);
  const locality = [place.postalCode, place.city].filter(Boolean).join(' ');
  return locality ? `${locality} · ${place.countryCode}` : place.countryCode;
}

function comparablePostalCode(value: string): string {
  return normalizePostalCode(value).replace(/[^A-Z0-9]/g, '');
}

export function postalCodesLikelyMatch(requested: string, returned: string): boolean {
  const left = comparablePostalCode(requested);
  const right = comparablePostalCode(returned);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= postalCodeMinLength && longer.startsWith(shorter);
}

export function cityFromPostalAddress(address: PostalAddressCandidate): string | null {
  const candidates = [
    address.city,
    address.district,
    address.subregion,
    address.name,
    address.region,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const city = normalizeCity(candidate);
    if (city) return city;
  }
  return null;
}

export function pickPostalAddress(
  addresses: readonly PostalAddressCandidate[],
  requested: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'>,
): PostalAddressCandidate | null {
  const countryCode = normalizeCountryCode(requested.countryCode);
  const postalCode = normalizePostalCode(requested.postalCode);
  const eligible = addresses.filter((address) => {
    if (!cityFromPostalAddress(address)) return false;
    const returnedCountry = normalizeCountryCode(address.isoCountryCode ?? '');
    if (returnedCountry && returnedCountry !== countryCode) return false;
    if (address.postalCode && !postalCodesLikelyMatch(postalCode, address.postalCode)) return false;
    return true;
  });

  return (
    eligible.sort((left, right) => {
      const score = (address: PostalAddressCandidate) =>
        (normalizeCountryCode(address.isoCountryCode ?? '') === countryCode ? 4 : 0) +
        (address.postalCode && postalCodesLikelyMatch(postalCode, address.postalCode) ? 3 : 0) +
        (address.city ? 2 : 0);
      return score(right) - score(left);
    })[0] ?? null
  );
}
