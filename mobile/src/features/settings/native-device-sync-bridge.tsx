import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { synchronizePushRegistration } from './native-device-sync';
import { subscribeToNotificationSettings } from './settings-storage';

import { useAuth } from '@/features/auth/auth-context';
import i18n from '@/i18n';

const foregroundSyncIntervalMs = 60_000;

export function NativeDeviceSyncBridge() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const lastForegroundSync = useRef(0);

  useEffect(() => {
    if (!userId) return;
    let running = false;

    const synchronize = async (force = false) => {
      const now = Date.now();
      if (running || (!force && now - lastForegroundSync.current < foregroundSyncIntervalMs)) {
        return;
      }
      running = true;
      lastForegroundSync.current = now;
      const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
      try {
        await synchronizePushRegistration(userId, locale);
      } catch {
        // A network failure is retried on the next foreground transition.
      } finally {
        running = false;
      }
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
      appState.remove();
      notificationSettings();
    };
  }, [userId]);

  return null;
}
