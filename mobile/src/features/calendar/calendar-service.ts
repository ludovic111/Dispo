import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

/** Carte `identifiant Dispo → identifiant d'événement de l'appareil`, plus les choix de l'utilisateur. */
export interface CalendarEventMap {
  /** Sessions retirées à la main : la synchronisation ne les recrée pas. */
  excluded: string[];
  events: Record<string, string>;
  /** Sessions ajoutées par la synchronisation : seules celles-ci sont retirées quand la date disparaît. */
  synced: string[];
}

export interface CalendarEventInput {
  endsAt?: string | Date | undefined;
  location?: string | undefined;
  notes?: string | undefined;
  /** Identifiant stable côté Dispo (`group-event:<id>`, `gig:<id>`). */
  sourceId: string;
  startsAt: string | Date;
  title: string;
  url?: string | undefined;
}

export const calendarEventMapKey = 'dispo.calendar.event-map';
export const dispoCalendarIdKey = 'dispo.calendar.calendar-id';
export const dispoCalendarTitle = 'Dispo';
export const defaultEventDurationMs = 2 * 60 * 60 * 1000;
const dispoCalendarColor = '#00D2FF';
const emptyMap: CalendarEventMap = { events: {}, excluded: [], synced: [] };
const mapListeners = new Set<() => void>();
let pendingMutation: Promise<void> = Promise.resolve();

function serializeCalendarMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingMutation.then(operation);
  pendingMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function emitMapChange(): void {
  for (const listener of mapListeners) listener();
}

/** Prévient les boutons « Ajouter au calendrier » quand la carte change (synchronisation comprise). */
export function subscribeToCalendarEvents(listener: () => void): () => void {
  mapListeners.add(listener);
  return () => {
    mapListeners.delete(listener);
  };
}

export async function loadCalendarEventMap(): Promise<CalendarEventMap> {
  const raw = await AsyncStorage.getItem(calendarEventMapKey);
  if (!raw) return { ...emptyMap };
  try {
    const parsed = JSON.parse(raw) as Partial<CalendarEventMap>;
    const events =
      typeof parsed.events === 'object' && parsed.events !== null
        ? Object.fromEntries(
            Object.entries(parsed.events).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : {};
    return {
      events,
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded.filter(isString) : [],
      synced: Array.isArray(parsed.synced) ? parsed.synced.filter(isString) : [],
    };
  } catch {
    return { ...emptyMap };
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

async function saveCalendarEventMap(map: CalendarEventMap): Promise<void> {
  await AsyncStorage.setItem(calendarEventMapKey, JSON.stringify(map));
  emitMapChange();
}

export async function hasCalendarAccess(): Promise<boolean> {
  try {
    const response = await Calendar.getCalendarPermissionsAsync();
    return response.status === 'granted';
  } catch {
    return false;
  }
}

/** Demande l'accès au calendrier ; `false` si l'utilisateur refuse ou si la plateforme ne l'offre pas. */
export async function requestCalendarAccess(): Promise<boolean> {
  try {
    const response = await Calendar.requestCalendarPermissionsAsync();
    return response.status === 'granted';
  } catch {
    return false;
  }
}

function writableCalendars(calendars: Calendar.Calendar[]): Calendar.Calendar[] {
  return calendars.filter(
    (calendar) =>
      calendar.allowsModifications &&
      (calendar.entityType === undefined || calendar.entityType === Calendar.EntityTypes.EVENT),
  );
}

async function defaultWritableCalendar(): Promise<Calendar.Calendar | null> {
  if (Platform.OS === 'ios') {
    try {
      return await Calendar.getDefaultCalendarAsync();
    } catch {
      // Falls through to the shared lookup below.
    }
  }
  const calendars = writableCalendars(await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT));
  return calendars.find((calendar) => calendar.isPrimary) ?? calendars[0] ?? null;
}

async function createDispoCalendar(): Promise<string> {
  if (Platform.OS === 'ios') {
    const reference = await defaultWritableCalendar();
    if (!reference) throw new Error('calendar_source_unavailable');
    return Calendar.createCalendarAsync({
      color: dispoCalendarColor,
      entityType: Calendar.EntityTypes.EVENT,
      name: dispoCalendarTitle,
      source: reference.source,
      title: dispoCalendarTitle,
      ...(reference.sourceId ? { sourceId: reference.sourceId } : {}),
    });
  }
  return Calendar.createCalendarAsync({
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    color: dispoCalendarColor,
    entityType: Calendar.EntityTypes.EVENT,
    isSynced: true,
    isVisible: true,
    name: dispoCalendarTitle,
    ownerAccount: dispoCalendarTitle,
    source: { isLocalAccount: true, name: dispoCalendarTitle, type: Calendar.SourceType.LOCAL },
    title: dispoCalendarTitle,
  });
}

/**
 * Calendrier « Dispo » de l'appareil : réutilisé s'il existe, créé sinon, et
 * remplacé par le calendrier par défaut quand la création est impossible.
 */
export async function getOrCreateDispoCalendar(): Promise<string> {
  const calendars = writableCalendars(await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT));
  const storedId = await AsyncStorage.getItem(dispoCalendarIdKey);
  const stored = storedId ? calendars.find((calendar) => calendar.id === storedId) : undefined;
  if (stored) return stored.id;

  const existing = calendars.find((calendar) => calendar.title === dispoCalendarTitle);
  if (existing) {
    await AsyncStorage.setItem(dispoCalendarIdKey, existing.id);
    return existing.id;
  }

  let id: string;
  try {
    id = await createDispoCalendar();
  } catch {
    const fallback = await defaultWritableCalendar();
    if (!fallback) throw new Error('calendar_unavailable');
    id = fallback.id;
  }
  await AsyncStorage.setItem(dispoCalendarIdKey, id);
  return id;
}

function eventDetails(input: CalendarEventInput) {
  const startDate = new Date(input.startsAt);
  const endDate = input.endsAt
    ? new Date(input.endsAt)
    : new Date(startDate.getTime() + defaultEventDurationMs);
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  return {
    allDay: false,
    endDate,
    location: input.location ?? '',
    notes: input.notes ?? '',
    startDate,
    title: input.title,
    ...(timeZone ? { timeZone } : {}),
    ...(input.url && Platform.OS === 'ios' ? { url: input.url } : {}),
  };
}

export async function isCalendarEventPresent(sourceId: string): Promise<boolean> {
  const map = await loadCalendarEventMap();
  return sourceId in map.events;
}

/**
 * Crée ou met à jour l'événement de l'appareil lié à `sourceId`, sans jamais le
 * dupliquer : la carte locale garde l'identifiant et le réutilise.
 */
export function upsertCalendarEvent(
  input: CalendarEventInput,
  options: { synced?: boolean } = {},
): Promise<string> {
  return serializeCalendarMutation(() => upsertCalendarEventNow(input, options));
}

async function upsertCalendarEventNow(
  input: CalendarEventInput,
  options: { synced?: boolean },
): Promise<string> {
  const map = await loadCalendarEventMap();
  const details = eventDetails(input);
  const existingId = map.events[input.sourceId];
  let eventId: string | null = null;
  if (existingId) {
    try {
      await Calendar.updateEventAsync(existingId, details);
      eventId = existingId;
    } catch {
      // The user deleted it from the calendar app: recreate it below.
      eventId = null;
    }
  }
  if (!eventId) {
    const calendarId = await getOrCreateDispoCalendar();
    eventId = await Calendar.createEventAsync(calendarId, details);
  }
  const synced = options.synced
    ? [...new Set([...map.synced, input.sourceId])]
    : map.synced.filter((id) => id !== input.sourceId);
  await saveCalendarEventMap({
    events: { ...map.events, [input.sourceId]: eventId },
    excluded: map.excluded.filter((id) => id !== input.sourceId),
    synced,
  });
  return eventId;
}

/** Retire l'événement lié à `sourceId` ; `exclude` mémorise le choix face à la synchronisation. */
export function removeCalendarEvent(
  sourceId: string,
  options: { exclude?: boolean } = {},
): Promise<void> {
  return serializeCalendarMutation(() => removeCalendarEventNow(sourceId, options));
}

async function removeCalendarEventNow(
  sourceId: string,
  options: { exclude?: boolean },
): Promise<void> {
  const map = await loadCalendarEventMap();
  const eventId = map.events[sourceId];
  if (eventId) {
    try {
      await Calendar.deleteEventAsync(eventId);
    } catch {
      // Already gone from the device: the map entry is stale and dropped below.
    }
  }
  const events = { ...map.events };
  delete events[sourceId];
  await saveCalendarEventMap({
    events,
    excluded: options.exclude
      ? [...new Set([...map.excluded, sourceId])]
      : map.excluded.filter((id) => id !== sourceId),
    synced: map.synced.filter((id) => id !== sourceId),
  });
}
