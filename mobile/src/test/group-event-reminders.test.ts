import { describe, expect, it, jest } from '@jest/globals';
import type * as Notifications from 'expo-notifications';

import {
  buildGroupEventReminderPlans,
  type EventReminderDependencies,
  type EventReminderNotificationsApi,
  MAX_SCHEDULED_EVENT_REMINDERS,
  pruneGroupEventRemindersForAccount,
  reconcileGroupEventReminders,
} from '@/features/groups/group-event-reminders';
import type {
  GroupAttendance,
  GroupEvent,
  GroupMember,
  MusicGroup,
} from '@/features/groups/group-model';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 'high' },
  IosAuthorizationStatus: {
    AUTHORIZED: 2,
    DENIED: 1,
    EPHEMERAL: 4,
    PROVISIONAL: 3,
  },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
}));

const now = new Date('2026-09-01T10:00:00.000Z');
const currentUserId = '11111111-1111-4111-8111-111111111111';

function member(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    id: currentUserId,
    instruments: ['Piano'],
    isLeader: true,
    kind: 'permanent',
    name: 'Ludovic',
    photoUrl: null,
    role: 'Piano',
    ...overrides,
  };
}

function event(id: string, date: string, attendance: GroupAttendance[] = []): GroupEvent {
  return {
    attendance,
    date,
    exactAddress: null,
    groupId: 'group-1',
    id,
    kind: 'Répétition',
    privateLocationState: 'absent',
    publicLocationLabel: 'Studio · 1201 Genève · CH',
    recurrence: 'Chaque semaine',
    reminderLeadDays: 2,
    seriesId: 'series-1',
    setlist: [],
    title: 'Répétition générale',
    venue: 'Studio 42',
  };
}

function group(events: GroupEvent[], overrides: Partial<MusicGroup> = {}): MusicGroup {
  return {
    autoSosEnabled: false,
    autoSosMinLevel: null,
    comments: [],
    documents: [],
    emoji: '🎺',
    events,
    id: 'group-1',
    isPublic: false,
    leaderId: currentUserId,
    members: [member()],
    messages: [],
    name: 'Copper Band',
    pendingInvitations: [],
    photoUrl: null,
    repertoire: [],
    ...overrides,
  };
}

function fakeDependencies(
  options: {
    enabled?: boolean;
    groupsEnabled?: boolean;
    permission?: 'denied' | 'granted';
    scheduled?: string[];
  } = {},
) {
  const identifiers = new Set(options.scheduled ?? []);
  const cancelScheduledNotificationAsync = jest.fn(async (identifier: string) => {
    identifiers.delete(identifier);
  });
  const getAllScheduledNotificationsAsync = jest.fn(async () =>
    [...identifiers].map((identifier) => ({ identifier })),
  );
  const scheduleNotificationAsync = jest.fn(
    async (request: Notifications.NotificationRequestInput) => {
      const identifier = request.identifier ?? 'generated';
      identifiers.add(identifier);
      return identifier;
    },
  );
  const notifications: EventReminderNotificationsApi = {
    cancelScheduledNotificationAsync,
    getAllScheduledNotificationsAsync,
    scheduleNotificationAsync,
  };
  const dependencies: EventReminderDependencies = {
    getNotificationPermission: jest
      .fn<() => Promise<'denied' | 'granted'>>()
      .mockResolvedValue(options.permission ?? 'granted'),
    loadNotificationsEnabled: jest
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(options.enabled ?? true),
    loadPushPreferences: jest.fn(async () => ({
      groups: options.groupsEnabled ?? true,
      messages: true,
      sos: true,
    })),
    notifications,
  };
  return {
    cancelScheduledNotificationAsync,
    dependencies,
    identifiers,
    scheduleNotificationAsync,
  };
}

describe('rappels locaux des événements de groupe', () => {
  it('borne une série annuelle aux 16 prochaines occurrences', () => {
    const events = Array.from({ length: 52 }, (_, index) => {
      const date = new Date('2026-09-10T19:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index * 7);
      return event(`event-${index}`, date.toISOString());
    });

    const plans = buildGroupEventReminderPlans({
      groups: [group(events)],
      now,
      userId: currentUserId,
    });

    expect(plans).toHaveLength(MAX_SCHEDULED_EVENT_REMINDERS);
    expect(new Set(plans.map((plan) => plan.eventId)).size).toBe(MAX_SCHEDULED_EVENT_REMINDERS);
    expect(plans.every((plan) => plan.identifier.includes(currentUserId))).toBe(true);
  });

  it("adapte mon rappel à ma réponse et alerte le leader pour l'indisponibilité d'un membre", () => {
    const absentId = '22222222-2222-4222-8222-222222222222';
    const session = event('event-1', '2026-09-10T19:00:00.000Z', [
      { profileId: currentUserId, status: 'available' },
      { profileId: absentId, status: 'unavailable' },
    ]);
    const plans = buildGroupEventReminderPlans({
      groups: [
        group([session], {
          members: [
            member(),
            member({ id: absentId, isLeader: false, name: 'Raphaël', role: 'Basse' }),
          ],
        }),
      ],
      now,
      userId: currentUserId,
    });

    expect(plans.map((plan) => plan.type)).toEqual(['attendance', 'unavailable']);
    expect(plans[0]?.body).toContain('Studio 42');
    expect(plans[1]?.body).toContain('Raphaël');
  });

  it('supprime les rappels obsolètes ou hérités puis remplace le rappel stable', async () => {
    const desiredId = `dispo.event.${currentUserId}.event-1`;
    const dependencies = fakeDependencies({
      scheduled: [
        desiredId,
        `dispo.event.${currentUserId}.deleted-event`,
        'dispo.event.99999999-9999-4999-8999-999999999999.other-event',
        'event.legacy-event',
        'calendar.unrelated',
      ],
    });

    const result = await reconcileGroupEventReminders(
      {
        groups: [group([event('event-1', '2026-09-10T19:00:00.000Z')])],
        now,
        userId: currentUserId,
      },
      dependencies.dependencies,
    );

    expect(result).toEqual({ cancelled: 4, desired: 1, failed: 0, scheduled: 1 });
    expect(dependencies.cancelScheduledNotificationAsync).toHaveBeenCalledWith(desiredId);
    expect(dependencies.identifiers.has('calendar.unrelated')).toBe(true);
    expect(dependencies.identifiers.has(desiredId)).toBe(true);
    expect(dependencies.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('ne planifie rien si le réglage Groupes ou la permission est coupé', async () => {
    const dependencies = fakeDependencies({
      groupsEnabled: false,
      scheduled: [
        `dispo.event.${currentUserId}.event-1`,
        `dispo.unavailable.${currentUserId}.event-1.member-1`,
      ],
    });

    const result = await reconcileGroupEventReminders(
      {
        groups: [group([event('event-1', '2026-09-10T19:00:00.000Z')])],
        now,
        userId: currentUserId,
      },
      dependencies.dependencies,
    );

    expect(result).toEqual({ cancelled: 2, desired: 0, failed: 0, scheduled: 0 });
    expect(dependencies.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('purge seulement les anciens comptes lors du changement de session', async () => {
    const mine = `dispo.event.${currentUserId}.event-1`;
    const other = 'dispo.event.99999999-9999-4999-8999-999999999999.event-2';
    const dependencies = fakeDependencies({ scheduled: [mine, other, 'calendar.unrelated'] });

    await expect(
      pruneGroupEventRemindersForAccount(currentUserId, dependencies.dependencies.notifications),
    ).resolves.toBe(1);
    expect(dependencies.identifiers).toEqual(new Set([mine, 'calendar.unrelated']));
  });
});
