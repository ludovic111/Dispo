import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import {
  canResolvePostalPlace,
  cityFromPostalAddress,
  formatPostalPlace,
  isPlausiblePostalCode,
  normalizePostalPlaceDraft,
  pickPostalAddress,
  postalCodesLikelyMatch,
  type PostalAddressCandidate,
  type ResolvedPostalPlace,
} from '@/features/location/postal-place-model';
import {
  clearPostalPlaceResolverCache,
  resolvePostalPlace,
  type PostalPlaceGeocoder,
  type PostalPlaceResolver,
} from '@/features/location/postal-place-resolver';
import { usePostalPlaceResolver } from '@/features/location/use-postal-place-resolver';

const genevaAddress: PostalAddressCandidate = {
  city: 'Genève',
  country: 'Suisse',
  district: null,
  isoCountryCode: 'CH',
  name: null,
  postalCode: '1201',
  region: 'Genève',
  subregion: null,
};

const genevaPlace: ResolvedPostalPlace = {
  city: 'Genève',
  countryCode: 'CH',
  countryName: 'Suisse',
  latitude: 46.21,
  longitude: 6.14,
  postalCode: '1201',
  source: 'native-geocoder',
};

beforeEach(() => {
  clearPostalPlaceResolverCache();
});

describe('postal place parity model', () => {
  it('normalizes and formats the shared native place label', () => {
    const place = normalizePostalPlaceDraft({
      city: '  Genève  ',
      countryCode: ' ch ',
      postalCode: '  h2x  1y4 ',
    });
    expect(place).toEqual({ city: 'Genève', countryCode: 'CH', postalCode: 'H2X 1Y4' });
    expect(formatPostalPlace(place)).toBe('H2X 1Y4 Genève · CH');
  });

  it('accepts international numeric and alphanumeric postal-code lengths', () => {
    expect(isPlausiblePostalCode('12')).toBe(false);
    expect(isPlausiblePostalCode('1201')).toBe(true);
    expect(isPlausiblePostalCode('SW1A 1AA')).toBe(true);
    expect(isPlausiblePostalCode('12345678901')).toBe(false);
    expect(canResolvePostalPlace({ countryCode: 'CH', postalCode: '1201' })).toBe(true);
    expect(canResolvePostalPlace({ countryCode: '', postalCode: '1201' })).toBe(false);
  });

  it('matches full postal codes with their three-character regional prefix', () => {
    expect(postalCodesLikelyMatch('H2X', 'H2X 1Y4')).toBe(true);
    expect(postalCodesLikelyMatch('1201', '1202')).toBe(false);
  });

  it('uses the same city fallback order as the native resolver', () => {
    expect(cityFromPostalAddress({ ...genevaAddress, city: null, district: 'Pâquis' })).toBe(
      'Pâquis',
    );
    expect(
      pickPostalAddress(
        [
          { ...genevaAddress, city: 'Annemasse', isoCountryCode: 'FR', postalCode: '74100' },
          genevaAddress,
        ],
        { countryCode: 'CH', postalCode: '1201' },
      ),
    ).toEqual(genevaAddress);
  });
});

describe('postal place native geocoder', () => {
  it('geocodes then reverse-geocodes without asking for device position', async () => {
    const geocoder: PostalPlaceGeocoder = {
      geocode: jest.fn(async () => [{ latitude: 46.21, longitude: 6.14 }]),
      reverseGeocode: jest.fn(async () => [genevaAddress]),
    };

    await expect(
      resolvePostalPlace({ countryCode: 'ch', postalCode: ' 1201 ' }, geocoder),
    ).resolves.toEqual(genevaPlace);
    expect(geocoder.geocode).toHaveBeenCalledWith('1201, CH');
    expect(geocoder.reverseGeocode).toHaveBeenCalledWith({ latitude: 46.21, longitude: 6.14 });
  });

  it('does not invent a city when the reverse result belongs elsewhere', async () => {
    const geocoder: PostalPlaceGeocoder = {
      geocode: jest.fn(async () => [{ latitude: 46.21, longitude: 6.14 }]),
      reverseGeocode: jest.fn(async () => [
        { ...genevaAddress, city: 'Annemasse', isoCountryCode: 'FR', postalCode: '74100' },
      ]),
    };
    await expect(
      resolvePostalPlace({ countryCode: 'CH', postalCode: '1201' }, geocoder),
    ).resolves.toBeNull();
  });
});

describe('debounced postal place hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits 450 ms before using the platform geocoder', async () => {
    const resolver: PostalPlaceResolver = jest.fn(async () => genevaPlace);
    const { result } = await renderHook(() =>
      usePostalPlaceResolver({ countryCode: 'CH', postalCode: '1201', resolver }),
    );

    expect(result.current.status).toBe('waiting');
    expect(resolver).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(450);
    });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ place: genevaPlace, status: 'resolved' });
  });

  it('ignores a stale result after the postal code changes', async () => {
    let resolveFirst: ((place: ResolvedPostalPlace | null) => void) | undefined;
    const resolver = jest
      .fn<PostalPlaceResolver>()
      .mockImplementationOnce(
        () =>
          new Promise<ResolvedPostalPlace | null>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...genevaPlace, city: 'Lausanne', postalCode: '1003' });
    const { result, rerender } = await renderHook(
      ({ postalCode }: { postalCode: string }) =>
        usePostalPlaceResolver({ countryCode: 'CH', postalCode, resolver }),
      { initialProps: { postalCode: '1201' } },
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(450);
    });
    expect(result.current.status).toBe('resolving');

    await rerender({ postalCode: '1003' });
    await act(async () => {
      resolveFirst?.(genevaPlace);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('waiting');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(450);
    });
    expect(result.current).toMatchObject({
      place: expect.objectContaining({ city: 'Lausanne', postalCode: '1003' }),
      status: 'resolved',
    });
  });
});
