import Constants from 'expo-constants';

import {
  hasCalendarAccess,
  loadCalendarEventMap,
  removeCalendarEvent,
  upsertCalendarEvent,
  type CalendarEventInput,
} from './calendar-service';

import type { SessionItem } from '@/features/sessions/session-model';

export const calendarSyncMinIntervalMs = 60_000;
const groupEventPrefix = 'group-event:';
const gigPrefix = 'gig:';

export function groupEventCalendarSourceId(eventId: string): string {
  return `${groupEventPrefix}${eventId}`;
}

export function gigCalendarSourceId(gigId: string): string {
  return `${gigPrefix}${gigId}`;
}

/** Identifiant stable d'une session dans le calendrier, ou `null` si elle n'y a pas sa place. */
export function sessionCalendarSourceId(
  item: Pick<SessionItem, 'eventId' | 'gigId' | 'source'>,
): string | null {
  if (item.source === 'group' && item.eventId) return groupEventCalendarSourceId(item.eventId);
  if (item.source === 'playing' && item.gigId) return gigCalendarSourceId(item.gigId);
  return null;
}

function configuredScheme(): string {
  const configured = Constants.expoConfig?.scheme;
  if (Array.isArray(configured)) return configured[0] ?? 'dispo';
  return configured ?? 'dispo';
}

/** Lien profond vers la session, ouvert depuis les notes de l'événement. */
export function sessionDeepLink(
  item: Pick<SessionItem, 'eventId' | 'gigId' | 'groupId'>,
  scheme = configuredScheme(),
): string | null {
  if (item.groupId && item.eventId)
    return `${scheme}://groups/${item.groupId}/events/${item.eventId}`;
  if (item.gigId) return `${scheme}://gigs/${item.gigId}`;
  return null;
}

export interface CalendarSyncCopy {
  /** Libellé « Dépannage pour {{name}} » pour les SOS acceptés. */
  playingWith: (hostName: string) => string;
}

/**
 * Sessions à synchroniser : dates de mes groupes où je ne me suis pas déclaré
 * indisponible, et dépannages acceptés. Les candidatures en attente et mes
 * propres SOS n'ont pas leur place dans le calendrier tant qu'ils ne sont pas joués.
 */
export function calendarEventsForSessions(
  items: SessionItem[],
  copy: CalendarSyncCopy,
  scheme = configuredScheme(),
): CalendarEventInput[] {
  const events: CalendarEventInput[] = [];
  for (const item of items) {
    const sourceId = sessionCalendarSourceId(item);
    if (!sourceId) continue;
    if (item.source === 'group' && item.attendanceStatus === 'unavailable') continue;
    if (Number.isNaN(new Date(item.date).getTime())) continue;
    const link = sessionDeepLink(item, scheme);
    const context =
      item.source === 'group'
        ? item.groupName
        : item.hostName
          ? copy.playingWith(item.hostName)
          : null;
    events.push({
      notes: [context, link].filter((part): part is string => Boolean(part)).join('\n'),
      sourceId,
      startsAt: item.date,
      title: item.title,
      ...(item.place ? { location: item.place } : {}),
      ...(link ? { url: link } : {}),
    });
  }
  return events;
}

export interface CalendarSyncResult {
  removed: number;
  skipped: boolean;
  upserted: number;
}

/**
 * Aligne le calendrier sur les sessions à venir : crée ou met à jour chaque
 * date, retire celles que la synchronisation avait ajoutées et qui n'existent
 * plus, respecte les retraits manuels. Sans permission, ne touche à rien.
 */
export async function syncSessionsToCalendar(
  items: SessionItem[],
  copy: CalendarSyncCopy,
): Promise<CalendarSyncResult> {
  if (!(await hasCalendarAccess())) return { removed: 0, skipped: true, upserted: 0 };
  const desired = calendarEventsForSessions(items, copy);
  const desiredIds = new Set(desired.map((event) => event.sourceId));
  const before = await loadCalendarEventMap();
  const excluded = new Set(before.excluded);
  let upserted = 0;
  let removed = 0;
  for (const event of desired) {
    if (excluded.has(event.sourceId)) continue;
    await upsertCalendarEvent(event, { synced: true });
    upserted += 1;
  }
  for (const sourceId of before.synced) {
    if (desiredIds.has(sourceId)) continue;
    await removeCalendarEvent(sourceId);
    removed += 1;
  }
  return { removed, skipped: false, upserted };
}

/** Anti-rebond des passages au premier plan : une synchronisation par minute, sauf demande explicite. */
export function createCalendarSyncScheduler(minIntervalMs = calendarSyncMinIntervalMs) {
  let last: number | null = null;
  return {
    reset(): void {
      last = null;
    },
    shouldRun(now: number, force = false): boolean {
      if (!force && last !== null && now - last < minIntervalMs) return false;
      last = now;
      return true;
    },
  };
}
