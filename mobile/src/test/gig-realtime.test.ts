import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import { gigKeys } from '@/features/gigs/gig-queries';
import {
  createCoalescedInvalidator,
  gigRealtimeCoalesceMs,
  gigRealtimeTables,
  invalidateGigRealtimeData,
} from '@/features/gigs/gig-realtime';
import { sessionKeys } from '@/features/sessions/session-queries';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

afterEach(() => {
  jest.useRealTimers();
});

describe('fraîcheur Realtime des SOS', () => {
  it('écoute les annonces et les candidatures', () => {
    expect(gigRealtimeTables).toEqual(['gig_requests', 'gig_applications']);
  });

  it('coalesce une rafale et annule proprement une fermeture de session', async () => {
    jest.useFakeTimers();
    const invalidate = jest.fn(async () => undefined);
    const invalidator = createCoalescedInvalidator(invalidate);

    invalidator.schedule();
    invalidator.schedule();
    invalidator.schedule();
    await jest.advanceTimersByTimeAsync(gigRealtimeCoalesceMs - 1);
    expect(invalidate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(invalidate).toHaveBeenCalledTimes(1);

    invalidator.schedule();
    invalidator.cancel();
    await jest.advanceTimersByTimeAsync(gigRealtimeCoalesceMs);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('ne lance jamais deux invalidations en concurrence', async () => {
    jest.useFakeTimers();
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const invalidate = jest
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const invalidator = createCoalescedInvalidator(invalidate);

    invalidator.schedule();
    await jest.advanceTimersByTimeAsync(gigRealtimeCoalesceMs);
    expect(invalidate).toHaveBeenCalledTimes(1);
    invalidator.schedule();
    invalidator.schedule();
    await jest.advanceTimersByTimeAsync(gigRealtimeCoalesceMs * 2);
    expect(invalidate).toHaveBeenCalledTimes(1);

    releaseFirst();
    await first;
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(gigRealtimeCoalesceMs);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('invalide le feed, tous les détails, les matches et Sessions du compte', async () => {
    const queryClient = new QueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateGigRealtimeData(queryClient, 'profile-me');

    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate.mock.calls.map(([filter]) => filter)).toEqual([
      { exact: true, queryKey: gigKeys.feed('profile-me') },
      { queryKey: gigKeys.details('profile-me') },
      { queryKey: gigKeys.matchesForUser('profile-me') },
      { queryKey: sessionKeys.all },
    ]);
  });
});
