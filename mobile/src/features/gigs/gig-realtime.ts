import type { QueryClient } from '@tanstack/react-query';

import { gigKeys } from './gig-queries';

import { sessionKeys } from '@/features/sessions/session-queries';

export const gigRealtimeCoalesceMs = 300;
export const gigRealtimeTables = ['gig_requests', 'gig_applications'] as const;

export interface CoalescedInvalidator {
  cancel: () => void;
  schedule: () => void;
}

/** Coalesces a burst from both gig tables into one cache refresh. */
export function createCoalescedInvalidator(
  invalidate: () => Promise<void> | void,
  delayMs = gigRealtimeCoalesceMs,
): CoalescedInvalidator {
  let disposed = false;
  let pending = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = async () => {
    if (disposed) return;
    running = true;
    try {
      await invalidate();
    } catch {
      // A failed cache invalidation is recovered by the next realtime event
      // or foreground refetch; never break the subscription.
    } finally {
      running = false;
      if (pending && !disposed) {
        pending = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    if (disposed) return;
    if (running) {
      pending = true;
      return;
    }
    if (timer) return;
    timer = setTimeout(
      () => {
        timer = null;
        void run();
      },
      Math.max(0, delayMs),
    );
  };

  return {
    cancel: () => {
      disposed = true;
      pending = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    schedule,
  };
}

export async function invalidateGigRealtimeData(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ exact: true, queryKey: gigKeys.feed(userId) }),
    queryClient.invalidateQueries({ queryKey: gigKeys.details(userId) }),
    queryClient.invalidateQueries({ queryKey: gigKeys.matchesForUser(userId) }),
    queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  ]);
}
