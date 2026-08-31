import { geocodeAsync, reverseGeocodeAsync } from 'expo-location';

import {
  canResolvePostalPlace,
  cityFromPostalAddress,
  normalizeCountryCode,
  normalizePostalCode,
  pickPostalAddress,
  postalPlaceCacheKey,
  type PostalAddressCandidate,
  type PostalCoordinates,
  type PostalPlaceDraft,
  type ResolvedPostalPlace,
} from './postal-place-model';

export interface PostalPlaceGeocoder {
  geocode(address: string): Promise<readonly PostalCoordinates[]>;
  reverseGeocode(coordinates: PostalCoordinates): Promise<readonly PostalAddressCandidate[]>;
}

export type PostalPlaceResolver = (
  value: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'>,
) => Promise<ResolvedPostalPlace | null>;

const nativeGeocoder: PostalPlaceGeocoder = {
  geocode: geocodeAsync,
  reverseGeocode: reverseGeocodeAsync,
};

const resolvedPlaceCache = new Map<string, ResolvedPostalPlace>();

export function getCachedPostalPlace(
  value: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'>,
): ResolvedPostalPlace | null {
  return resolvedPlaceCache.get(postalPlaceCacheKey(value)) ?? null;
}

export function clearPostalPlaceResolverCache(): void {
  resolvedPlaceCache.clear();
}

/**
 * Uses the platform geocoder only. It never requests device-position
 * permission and never reads the user's current coordinates.
 */
export async function resolvePostalPlace(
  value: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'>,
  geocoder: PostalPlaceGeocoder = nativeGeocoder,
): Promise<ResolvedPostalPlace | null> {
  const countryCode = normalizeCountryCode(value.countryCode);
  const postalCode = normalizePostalCode(value.postalCode);
  const input = { countryCode, postalCode };
  if (!canResolvePostalPlace(input)) return null;

  const cached = getCachedPostalPlace(input);
  if (cached) return cached;

  const coordinates = await geocoder.geocode(`${postalCode}, ${countryCode}`);
  // Platform geocoders occasionally return several centroids. Keep the work
  // bounded, and accept only a reverse-geocoded address consistent with the
  // requested postal code and country.
  for (const coordinate of coordinates.slice(0, 3)) {
    const addresses = await geocoder.reverseGeocode(coordinate);
    const address = pickPostalAddress(addresses, input);
    if (!address) continue;
    const city = cityFromPostalAddress(address);
    if (!city) continue;
    const place: ResolvedPostalPlace = {
      city,
      countryCode: normalizeCountryCode(address.isoCountryCode ?? countryCode) || countryCode,
      countryName: address.country,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      postalCode,
      source: 'native-geocoder',
    };
    resolvedPlaceCache.set(postalPlaceCacheKey(input), place);
    return place;
  }
  return null;
}
