import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { createCalendarSyncScheduler, syncSessionsToCalendar } from './calendar-sync';

import { useSessions } from '@/features/sessions/session-queries';
import { calendarSyncKey, useBooleanPreference } from '@/features/settings/settings-storage';

/**
 * Synchronise les sessions à venir dans le calendrier quand le réglage est
 * actif : au passage au premier plan (au plus une fois par minute), dès que
 * le réglage s'active et quand l'agenda change.
 */
export function CalendarSyncBridge() {
  const { t } = useTranslation();
  const [enabled] = useBooleanPreference(calendarSyncKey);
  const sessions = useSessions();
  const scheduler = useMemo(() => createCalendarSyncScheduler(), []);
  const upcoming = sessions.data?.upcoming;
  const latest = useRef(upcoming);
  useEffect(() => {
    latest.current = upcoming;
  }, [upcoming]);
  const copy = useMemo(
    () => ({
      playingWith: (hostName: string) => t('Dépannage pour {{name}}', { name: hostName }),
    }),
    [t],
  );

  useEffect(() => {
    if (!enabled) {
      scheduler.reset();
      return;
    }
    let running = false;
    const run = async (force: boolean) => {
      const items = latest.current;
      if (!items || running || !scheduler.shouldRun(Date.now(), force)) return;
      running = true;
      try {
        await syncSessionsToCalendar(items, copy);
      } catch {
        // The next foreground transition retries.
      } finally {
        running = false;
      }
    };
    void run(true);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run(false);
    });
    return () => appState.remove();
  }, [copy, enabled, scheduler]);

  const updatedAt = sessions.dataUpdatedAt;
  useEffect(() => {
    if (!enabled || !upcoming || !updatedAt) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || !scheduler.shouldRun(Date.now())) return;
      void syncSessionsToCalendar(upcoming, copy).catch(() => undefined);
    }, 2_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [copy, enabled, scheduler, upcoming, updatedAt]);

  return null;
}
