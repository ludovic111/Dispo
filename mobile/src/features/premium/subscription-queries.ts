import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import type { PremiumCapability } from './premium-model';
import {
  fetchSubscription,
  refreshStoreSubscription,
  syncSubscription,
} from './subscription-service';

import { useAuth } from '@/features/auth/auth-context';

export function useSubscription() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['subscription', session?.user.id ?? ''],
    enabled: Boolean(session),
    queryFn: fetchSubscription,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
export function usePremiumCapability(_capability: PremiumCapability): boolean {
  return useSubscription().data?.tier === 'premium';
}
export function SubscriptionSyncBridge() {
  const { session } = useAuth();
  const client = useQueryClient();
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let busy = false;
    let last = 0;
    const refresh = async () => {
      if (busy || Date.now() - last < 30_000) return;
      busy = true;
      last = Date.now();
      try {
        if (Platform.OS === 'ios') await refreshStoreSubscription(userId);
        if (!active) return;
        await syncSubscription();
        if (active)
          await Promise.all([
            client.invalidateQueries({ queryKey: ['subscription', userId] }),
            client.invalidateQueries({ queryKey: ['profiles'] }),
            client.invalidateQueries({ queryKey: ['personal-repertoire', userId] }),
          ]);
      } catch {
        // Keep the last server state; purchases/restore expose actionable failures.
      } finally {
        busy = false;
      }
    };
    void refresh();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      foreground.remove();
    };
  }, [client, userId]);
  return null;
}
