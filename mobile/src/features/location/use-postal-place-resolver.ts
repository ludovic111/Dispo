import { useCallback, useEffect, useRef, useState } from 'react';

import {
  canResolvePostalPlace,
  idlePostalPlaceResolution,
  normalizeCountryCode,
  normalizePostalCode,
  postalPlaceCacheKey,
  type PostalPlaceDraft,
  type PostalPlaceResolutionState,
} from './postal-place-model';
import {
  getCachedPostalPlace,
  resolvePostalPlace,
  type PostalPlaceResolver,
} from './postal-place-resolver';

export const postalPlaceDebounceMs = 450;

export interface UsePostalPlaceResolverOptions {
  countryCode: string;
  debounceMs?: number;
  enabled?: boolean;
  postalCode: string;
  resolver?: PostalPlaceResolver;
}

export type UsePostalPlaceResolverResult = PostalPlaceResolutionState & { retry: () => void };

interface KeyedResolution {
  requestKey: string;
  state: PostalPlaceResolutionState;
}

export function usePostalPlaceResolver({
  countryCode,
  debounceMs = postalPlaceDebounceMs,
  enabled = true,
  postalCode,
  resolver = resolvePostalPlace,
}: UsePostalPlaceResolverOptions): UsePostalPlaceResolverResult {
  const [latest, setLatest] = useState<KeyedResolution>({
    requestKey: '',
    state: idlePostalPlaceResolution,
  });
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const normalizedPostalCode = normalizePostalCode(postalCode);
  const input: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'> = {
    countryCode: normalizedCountryCode,
    postalCode: normalizedPostalCode,
  };
  const resolvable = enabled && canResolvePostalPlace(input);
  const placeKey = postalPlaceCacheKey(input);
  const requestKey = `${placeKey}:${attempt}`;
  const cached = resolvable ? getCachedPostalPlace(input) : null;

  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (!resolvable || cached) return;
    const requestInput: Pick<PostalPlaceDraft, 'countryCode' | 'postalCode'> = {
      countryCode: normalizedCountryCode,
      postalCode: normalizedPostalCode,
    };
    const timer = setTimeout(
      () => {
        if (requestId.current !== currentRequest) return;
        setLatest({ requestKey, state: { place: null, status: 'resolving' } });
        void resolver(requestInput)
          .then((place) => {
            if (requestId.current !== currentRequest) return;
            setLatest({
              requestKey,
              state: place ? { place, status: 'resolved' } : { place: null, status: 'not-found' },
            });
          })
          .catch(() => {
            if (requestId.current !== currentRequest) return;
            setLatest({ requestKey, state: { place: null, status: 'unavailable' } });
          });
      },
      Math.max(0, debounceMs),
    );

    return () => {
      clearTimeout(timer);
      if (requestId.current === currentRequest) requestId.current += 1;
    };
  }, [
    cached,
    debounceMs,
    normalizedCountryCode,
    normalizedPostalCode,
    requestKey,
    resolvable,
    resolver,
  ]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const state: PostalPlaceResolutionState = !resolvable
    ? idlePostalPlaceResolution
    : cached
      ? { place: cached, status: 'resolved' }
      : latest.requestKey === requestKey
        ? latest.state
        : { place: null, status: 'waiting' };
  return { ...state, retry };
}
