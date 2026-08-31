import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { synchronizePushRegistration, synchronizeSharedLocation } from './native-device-sync';
import { subscribeToNotificationSettings } from './settings-storage';

import { useAuth } from '@/features/auth/auth-context';
import { profileKeys } from '@/features/profiles/profile-queries';
import i18n from '@/i18n';

const foregroundSyncIntervalMs = 60_000;

export function NativeDeviceSyncBridge() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? '';
  const lastForegroundSync = useRef(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let running = false;

    const synchronize = async (force = false) => {
      const now = Date.now();
      if (running || (!force && now - lastForegroundSync.current < foregroundSyncIntervalMs)) {
        return;
      }
      running = true;
      lastForegroundSync.current = now;
      const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
      const [location] = await Promise.allSettled([
        synchronizeSharedLocation(userId),
        synchronizePushRegistration(userId, locale),
      ]);
      running = false;
      if (!active || location.status !== 'fulfilled' || !location.value) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) }),
        queryClient.invalidateQueries({ queryKey: profileKeys.discovery(userId) }),
      ]);
    };

    void synchronize(true);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void synchronize();
    });
    const notificationSettings = subscribeToNotificationSettings(() => {
      void synchronizePushRegistration(
        userId,
        i18n.resolvedLanguage ?? i18n.language ?? 'fr',
      ).catch(() => undefined);
    });
    return () => {
      active = false;
      appState.remove();
      notificationSettings();
    };
  }, [queryClient, userId]);

  return null;
}
