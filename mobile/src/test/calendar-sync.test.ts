import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  calendarEventMapKey,
  dispoCalendarIdKey,
  loadCalendarEventMap,
  removeCalendarEvent,
  upsertCalendarEvent,
} from '@/features/calendar/calendar-service';
import {
  calendarEventsForSessions,
  createCalendarSyncScheduler,
  sessionCalendarSourceId,
  sessionDeepLink,
  syncSessionsToCalendar,
} from '@/features/calendar/calendar-sync';
import type { SessionItem } from '@/features/sessions/session-model';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

interface FakeEvent {
  calendarId: string;
  details: Record<string, unknown>;
}

const mockCalendar = {
  calendars: [] as { allowsModifications: boolean; id: string; title: string }[],
  createdCalendars: 0,
  deleted: [] as string[],
  events: new Map<string, FakeEvent>(),
  nextId: 1,
  permission: 'granted' as 'denied' | 'granted',
};

jest.mock('expo-calendar/legacy', () => ({
  CalendarAccessLevel: { OWNER: 'owner' },
  EntityTypes: { EVENT: 'event' },
  SourceType: { LOCAL: 'local' },
  createCalendarAsync: jest.fn(async () => {
    mockCalendar.createdCalendars += 1;
    const id = `cal-${mockCalendar.createdCalendars}`;
    mockCalendar.calendars.push({ allowsModifications: true, id, title: 'Dispo' });
    return id;
  }),
  createEventAsync: jest.fn(async (calendarId: string, details: Record<string, unknown>) => {
    const id = `evt-${mockCalendar.nextId++}`;
    mockCalendar.events.set(id, { calendarId, details });
    return id;
  }),
  deleteEventAsync: jest.fn(async (id: string) => {
    if (!mockCalendar.events.delete(id)) throw new Error('missing');
    mockCalendar.deleted.push(id);
  }),
  getCalendarPermissionsAsync: jest.fn(async () => ({ status: mockCalendar.permission })),
  getCalendarsAsync: jest.fn(async () => mockCalendar.calendars),
  getDefaultCalendarAsync: jest.fn(async () => ({
    allowsModifications: true,
    id: 'default',
    source: { name: 'iCloud', type: 'caldav' },
    sourceId: 'source-1',
    title: 'Calendrier',
  })),
  requestCalendarPermissionsAsync: jest.fn(async () => ({ status: mockCalendar.permission })),
  updateEventAsync: jest.fn(async (id: string, details: Record<string, unknown>) => {
    const existing = mockCalendar.events.get(id);
    if (!existing) throw new Error('missing');
    mockCalendar.events.set(id, { ...existing, details: { ...existing.details, ...details } });
    return id;
  }),
}));

const copy = { playingWith: (name: string) => `Dépannage pour ${name}` };

function session(overrides: Partial<SessionItem>): SessionItem {
  return {
    approvedSongCount: 0,
    attendanceStatus: 'available',
    availableCount: 3,
    confirmDeadline: null,
    date: '2026-10-02T19:30:00.000Z',
    eventId: 'ev-1',
    eventKind: 'Concert',
    gigId: null,
    groupEmoji: '🎷',
    groupId: 'grp-1',
    groupName: 'Quartet',
    hostName: null,
    id: 'group-ev-1',
    instrument: null,
    isFilled: true,
    lineupState: 'complete',
    missingRoles: [],
    pendingApplicantCount: 0,
    place: 'Chat Noir',
    presentCount: 3,
    recurrenceLabel: null,
    role: 'Piano',
    rosterCount: 3,
    source: 'group',
    title: 'Concert au Chat Noir',
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCalendar.calendars = [];
  mockCalendar.createdCalendars = 0;
  mockCalendar.deleted = [];
  mockCalendar.events.clear();
  mockCalendar.nextId = 1;
  mockCalendar.permission = 'granted';
});

describe('identifiants et liens des sessions', () => {
  it('ne synchronise que les dates de groupe et les dépannages acceptés', () => {
    expect(sessionCalendarSourceId(session({}))).toBe('group-event:ev-1');
    expect(
      sessionCalendarSourceId(session({ eventId: null, gigId: 'g-1', source: 'playing' })),
    ).toBe('gig:g-1');
    expect(
      sessionCalendarSourceId(session({ eventId: null, gigId: 'g-1', source: 'hosting' })),
    ).toBe(null);
    expect(
      sessionCalendarSourceId(session({ eventId: null, gigId: 'g-1', source: 'applied' })),
    ).toBe(null);
  });

  it('écrit un lien profond vers la session dans les notes', () => {
    expect(sessionDeepLink(session({}), 'dispo')).toBe('dispo://groups/grp-1/events/ev-1');
    expect(sessionDeepLink(session({ eventId: null, gigId: 'g-1', groupId: null }), 'dispo')).toBe(
      'dispo://gigs/g-1',
    );
    const events = calendarEventsForSessions(
      [
        session({}),
        session({ attendanceStatus: 'unavailable', eventId: 'ev-2', id: 'group-ev-2' }),
        session({ date: 'invalid', eventId: 'ev-3', id: 'group-ev-3' }),
        session({
          eventId: null,
          gigId: 'g-1',
          groupId: null,
          groupName: null,
          hostName: 'Marco',
          id: 'playing-g-1',
          source: 'playing',
          title: 'Jam du jeudi',
        }),
      ],
      copy,
      'dispo',
    );
    expect(events.map((event) => event.sourceId)).toEqual(['group-event:ev-1', 'gig:g-1']);
    expect(events[0]?.notes).toBe('Quartet\ndispo://groups/grp-1/events/ev-1');
    expect(events[0]?.location).toBe('Chat Noir');
    expect(events[1]?.notes).toBe('Dépannage pour Marco\ndispo://gigs/g-1');
  });
});

describe('calendrier Dispo de l’appareil', () => {
  it('sérialise les ajouts simultanés pour éviter les doublons et les entrées perdues', async () => {
    const input = { sourceId: 'same', startsAt: new Date(), title: 'Concert' };
    const [first, second] = await Promise.all([
      upsertCalendarEvent(input),
      upsertCalendarEvent(input),
      upsertCalendarEvent({ ...input, sourceId: 'other' }),
    ]);
    expect(first).toBe(second);
    expect(mockCalendar.events.size).toBe(2);
    expect(Object.keys((await loadCalendarEventMap()).events).sort()).toEqual(['other', 'same']);
  });

  it('crée le calendrier une seule fois et ne duplique jamais un événement', async () => {
    const first = await upsertCalendarEvent({
      sourceId: 'group-event:ev-1',
      startsAt: '2026-10-02T19:30:00.000Z',
      title: 'Concert',
    });
    const second = await upsertCalendarEvent({
      location: 'Chat Noir',
      sourceId: 'group-event:ev-1',
      startsAt: '2026-10-02T20:00:00.000Z',
      title: 'Concert (décalé)',
    });
    expect(second).toBe(first);
    expect(mockCalendar.createdCalendars).toBe(1);
    expect(mockCalendar.events.size).toBe(1);
    const stored = mockCalendar.events.get(first);
    expect(stored?.details.title).toBe('Concert (décalé)');
    expect(stored?.details.location).toBe('Chat Noir');
    const start = stored?.details.startDate as Date;
    const end = stored?.details.endDate as Date;
    expect(end.getTime() - start.getTime()).toBe(2 * 60 * 60 * 1000);
    await expect(AsyncStorage.getItem(dispoCalendarIdKey)).resolves.toBe('cal-1');
  });

  it('recrée l’événement si l’utilisateur l’a supprimé dans l’app Calendrier', async () => {
    const first = await upsertCalendarEvent({ sourceId: 's', startsAt: new Date(), title: 'A' });
    mockCalendar.events.delete(first);
    const second = await upsertCalendarEvent({ sourceId: 's', startsAt: new Date(), title: 'A' });
    expect(second).not.toBe(first);
    expect((await loadCalendarEventMap()).events.s).toBe(second);
  });

  it('retire l’événement et mémorise le retrait manuel', async () => {
    const id = await upsertCalendarEvent({ sourceId: 's', startsAt: new Date(), title: 'A' });
    await removeCalendarEvent('s', { exclude: true });
    expect(mockCalendar.deleted).toEqual([id]);
    await expect(loadCalendarEventMap()).resolves.toEqual({
      events: {},
      excluded: ['s'],
      synced: [],
    });
  });

  it('ignore une carte locale corrompue', async () => {
    await AsyncStorage.setItem(calendarEventMapKey, '{not json');
    await expect(loadCalendarEventMap()).resolves.toEqual({ events: {}, excluded: [], synced: [] });
  });
});

describe('synchronisation des sessions', () => {
  it('ne touche à rien sans permission', async () => {
    mockCalendar.permission = 'denied';
    await expect(syncSessionsToCalendar([session({})], copy)).resolves.toEqual({
      removed: 0,
      skipped: true,
      upserted: 0,
    });
    expect(mockCalendar.events.size).toBe(0);
  });

  it('ajoute, met à jour, puis retire les sessions annulées sans toucher aux ajouts manuels', async () => {
    const manual = await upsertCalendarEvent({
      sourceId: 'group-event:manual',
      startsAt: new Date(),
      title: 'Ajout manuel',
    });
    const first = await syncSessionsToCalendar(
      [session({}), session({ eventId: 'ev-2', id: 'group-ev-2', title: 'Répé' })],
      copy,
    );
    expect(first).toEqual({ removed: 0, skipped: false, upserted: 2 });
    expect(mockCalendar.events.size).toBe(3);

    const again = await syncSessionsToCalendar(
      [session({ title: 'Concert (nouveau titre)' })],
      copy,
    );
    expect(again).toEqual({ removed: 1, skipped: false, upserted: 1 });
    expect(mockCalendar.events.size).toBe(2);
    expect(mockCalendar.events.has(manual)).toBe(true);
    const map = await loadCalendarEventMap();
    expect(Object.keys(map.events).sort()).toEqual(['group-event:ev-1', 'group-event:manual']);
    expect(map.synced).toEqual(['group-event:ev-1']);
    const kept = mockCalendar.events.get(map.events['group-event:ev-1'] ?? '');
    expect(kept?.details.title).toBe('Concert (nouveau titre)');
  });

  it('respecte une session retirée à la main', async () => {
    await syncSessionsToCalendar([session({})], copy);
    await removeCalendarEvent('group-event:ev-1', { exclude: true });
    await syncSessionsToCalendar([session({})], copy);
    expect(mockCalendar.events.size).toBe(0);
  });

  it('retombe sur le calendrier par défaut si la création échoue', async () => {
    const legacy = jest.requireMock('expo-calendar/legacy') as {
      createCalendarAsync: jest.Mock;
    };
    legacy.createCalendarAsync.mockImplementationOnce(async () => {
      throw new Error('no source');
    });
    mockCalendar.calendars = [{ allowsModifications: true, id: 'default', title: 'Calendrier' }];
    await upsertCalendarEvent({ sourceId: 's', startsAt: new Date(), title: 'A' });
    expect(mockCalendar.events.get('evt-1')?.calendarId).toBe('default');
  });
});

describe('anti-rebond du passage au premier plan', () => {
  it('laisse passer une synchronisation par minute, sauf demande explicite', () => {
    const scheduler = createCalendarSyncScheduler(60_000);
    expect(scheduler.shouldRun(1_000)).toBe(true);
    expect(scheduler.shouldRun(30_000)).toBe(false);
    expect(scheduler.shouldRun(30_000, true)).toBe(true);
    expect(scheduler.shouldRun(89_999)).toBe(false);
    expect(scheduler.shouldRun(90_000)).toBe(true);
    scheduler.reset();
    expect(scheduler.shouldRun(90_001)).toBe(true);
  });
});
