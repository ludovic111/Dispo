import { useCallback, useEffect, useState } from 'react';

import {
  isCalendarEventPresent,
  removeCalendarEvent,
  requestCalendarAccess,
  subscribeToCalendarEvents,
  upsertCalendarEvent,
  type CalendarEventInput,
} from './calendar-service';

export type CalendarEventToggleResult = 'added' | 'denied' | 'failed' | 'removed';

/**
 * État « présent dans le calendrier » d'une session, suivi en direct (bouton
 * et synchronisation partagent la même carte locale), plus l'action de bascule.
 */
export function useCalendarEvent(input: CalendarEventInput) {
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const { sourceId } = input;

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void isCalendarEventPresent(sourceId)
        .then((value) => {
          if (active) setPresent(value);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeToCalendarEvents(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [sourceId]);

  const toggle = useCallback(async (): Promise<CalendarEventToggleResult> => {
    if (busy) return 'failed';
    setBusy(true);
    try {
      if (present) {
        await removeCalendarEvent(sourceId, { exclude: true });
        return 'removed';
      }
      if (!(await requestCalendarAccess())) return 'denied';
      await upsertCalendarEvent(input);
      return 'added';
    } catch {
      return 'failed';
    } finally {
      setBusy(false);
    }
  }, [busy, input, present, sourceId]);

  return { busy, present, toggle };
}
