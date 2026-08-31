import * as Notifications from 'expo-notifications';

import { attendanceFor, type GroupEvent, type MusicGroup } from './group-model';

import {
  getNotificationPermission,
  type NotificationPermission,
} from '@/features/settings/settings-service';
import {
  loadNotificationsEnabled,
  loadPushPreferences,
} from '@/features/settings/settings-storage';
import i18n from '@/i18n';
import { formatSwiftPlaceholders } from '@/i18n/format';

const managedEventPrefix = 'dispo.event.';
const managedUnavailablePrefix = 'dispo.unavailable.';
const legacyEventPrefix = 'event.';
const legacyUnavailablePrefix = 'unavailable.';
const minimumScheduleDelayMs = 5_000;

/**
 * Comme l'app Swift, Dispo ne garde que les 16 prochains événements dans
 * l'horizon local. Une série hebdomadaire de 52 dates ne monopolise donc pas
 * la limite de notifications du système.
 */
export const MAX_SCHEDULED_EVENT_REMINDERS = 16;

type ScheduledRequest = Awaited<
  ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>
>[number];

export interface EventReminderNotificationsApi {
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  getAllScheduledNotificationsAsync(): Promise<Pick<ScheduledRequest, 'identifier'>[]>;
  scheduleNotificationAsync(request: Notifications.NotificationRequestInput): Promise<string>;
}

export interface EventReminderPlan {
  body: string;
  eventId: string;
  groupId: string;
  identifier: string;
  title: string;
  triggerAt: Date;
  type: 'attendance' | 'unavailable';
}

export interface ReconcileGroupEventRemindersInput {
  groups: readonly MusicGroup[];
  now?: Date;
  userId: string;
}

export interface ReconcileGroupEventRemindersResult {
  cancelled: number;
  desired: number;
  failed: number;
  scheduled: number;
}

export interface EventReminderDependencies {
  getNotificationPermission: () => Promise<NotificationPermission>;
  loadNotificationsEnabled: () => Promise<boolean>;
  loadPushPreferences: typeof loadPushPreferences;
  notifications: EventReminderNotificationsApi;
}

const defaultDependencies: EventReminderDependencies = {
  getNotificationPermission,
  loadNotificationsEnabled,
  loadPushPreferences,
  notifications: Notifications,
};

function normalizedAccountId(userId: string): string {
  return userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

function accountEventPrefix(userId: string): string {
  return `${managedEventPrefix}${normalizedAccountId(userId)}.`;
}

function accountUnavailablePrefix(userId: string): string {
  return `${managedUnavailablePrefix}${normalizedAccountId(userId)}.`;
}

function isManagedIdentifier(identifier: string): boolean {
  return (
    identifier.startsWith(managedEventPrefix) ||
    identifier.startsWith(managedUnavailablePrefix) ||
    identifier.startsWith(legacyEventPrefix) ||
    identifier.startsWith(legacyUnavailablePrefix)
  );
}

function belongsToAccount(identifier: string, userId: string): boolean {
  return (
    identifier.startsWith(accountEventPrefix(userId)) ||
    identifier.startsWith(accountUnavailablePrefix(userId))
  );
}

function eventReminderIdentifier(userId: string, eventId: string): string {
  return `${accountEventPrefix(userId)}${eventId.toLowerCase()}`;
}

function unavailableReminderIdentifier(userId: string, eventId: string, memberId: string): string {
  return `${accountUnavailablePrefix(userId)}${eventId.toLowerCase()}.${memberId.toLowerCase()}`;
}

function notificationPermissionAllowsDelivery(permission: NotificationPermission): boolean {
  return permission === 'ephemeral' || permission === 'granted' || permission === 'provisional';
}

function reminderLeadDays(event: GroupEvent): number {
  return Math.min(Math.max(event.reminderLeadDays ?? 2, 0), 60);
}

function eventDateLabel(date: Date): string {
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    weekday: 'long',
  }).format(date);
}

/** Construit uniquement les rappels dans l'horizon Swift de 16 événements. */
export function buildGroupEventReminderPlans(
  input: ReconcileGroupEventRemindersInput,
): EventReminderPlan[] {
  const now = input.now ?? new Date();
  const upcoming = input.groups
    .flatMap((group) =>
      group.events.flatMap((event) => {
        const date = new Date(event.date);
        return Number.isNaN(date.getTime()) || date <= now ? [] : [{ date, event, group }];
      }),
    )
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(0, MAX_SCHEDULED_EVENT_REMINDERS);
  const plans: EventReminderPlan[] = [];

  for (const { date, event, group } of upcoming) {
    const triggerAt = new Date(date.getTime() - reminderLeadDays(event) * 86_400_000);
    if (triggerAt.getTime() <= now.getTime() + minimumScheduleDelayMs) continue;
    const label = eventDateLabel(date);
    const myStatus = attendanceFor(event, input.userId);
    if (myStatus !== 'unavailable') {
      plans.push({
        body:
          myStatus === 'pending'
            ? formatSwiftPlaceholders(
                i18n.t('Confirmes-tu ta présence pour « %@ » le %@ ?'),
                event.title,
                label,
              )
            : formatSwiftPlaceholders(i18n.t('« %@ » — %@ à %@.'), event.title, label, event.venue),
        eventId: event.id,
        groupId: group.id,
        identifier: eventReminderIdentifier(input.userId, event.id),
        title: `${group.emoji} ${group.name}`,
        triggerAt,
        type: 'attendance',
      });
    }

    if (group.leaderId !== input.userId) continue;
    for (const member of group.members) {
      if (member.id === input.userId || attendanceFor(event, member.id) !== 'unavailable') continue;
      plans.push({
        body: formatSwiftPlaceholders(
          i18n.t('%@ est indispo pour « %@ » — trouve un remplaçant.'),
          member.name,
          event.title,
        ),
        eventId: event.id,
        groupId: group.id,
        identifier: unavailableReminderIdentifier(input.userId, event.id, member.id),
        title: formatSwiftPlaceholders(i18n.t('⚠️ Remplaçant pour %@'), group.name),
        triggerAt,
        type: 'unavailable',
      });
    }
  }

  return plans;
}

async function cancelIdentifiers(
  notifications: EventReminderNotificationsApi,
  identifiers: readonly string[],
): Promise<number> {
  const results = await Promise.allSettled(
    identifiers.map((identifier) => notifications.cancelScheduledNotificationAsync(identifier)),
  );
  return results.filter((result) => result.status === 'fulfilled').length;
}

/**
 * Réconcilie les rappels locaux avec le snapshot serveur courant. Les
 * identifiants contiennent l'identité Supabase : un changement de compte ne
 * peut jamais réutiliser le rappel d'un autre membre.
 */
export async function reconcileGroupEventReminders(
  input: ReconcileGroupEventRemindersInput,
  dependencies: EventReminderDependencies = defaultDependencies,
): Promise<ReconcileGroupEventRemindersResult> {
  const [enabled, preferences, permission, scheduled] = await Promise.all([
    dependencies.loadNotificationsEnabled(),
    dependencies.loadPushPreferences(),
    dependencies.getNotificationPermission(),
    dependencies.notifications.getAllScheduledNotificationsAsync(),
  ]);
  const shouldSchedule =
    enabled && preferences.groups && notificationPermissionAllowsDelivery(permission);
  const plans = shouldSchedule ? buildGroupEventReminderPlans(input) : [];
  const desiredIdentifiers = new Set(plans.map((plan) => plan.identifier));
  const identifiersToCancel = scheduled
    .map((request) => request.identifier)
    .filter(
      (identifier) =>
        isManagedIdentifier(identifier) &&
        (!belongsToAccount(identifier, input.userId) ||
          desiredIdentifiers.has(identifier) === false),
    );

  // Comme Swift, un rappel qui reste désiré est aussi remplacé : le texte, la
  // date ou le délai peuvent avoir changé sans que son identifiant change.
  identifiersToCancel.push(
    ...scheduled
      .map((request) => request.identifier)
      .filter(
        (identifier) =>
          belongsToAccount(identifier, input.userId) && desiredIdentifiers.has(identifier),
      ),
  );
  const uniqueToCancel = [...new Set(identifiersToCancel)];
  const cancelled = await cancelIdentifiers(dependencies.notifications, uniqueToCancel);

  const results = await Promise.allSettled(
    plans.map((plan) =>
      dependencies.notifications.scheduleNotificationAsync({
        content: {
          badge: 1,
          body: plan.body,
          categoryIdentifier: 'groups',
          data: {
            category: 'groups',
            event_id: plan.eventId,
            group_id: plan.groupId,
            target_tab: 'groups',
          },
          sound: 'default',
          title: plan.title,
        },
        identifier: plan.identifier,
        trigger: {
          channelId: 'default',
          date: plan.triggerAt,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
        },
      }),
    ),
  );
  const scheduledCount = results.filter((result) => result.status === 'fulfilled').length;
  return {
    cancelled,
    desired: plans.length,
    failed: results.length - scheduledCount,
    scheduled: scheduledCount,
  };
}

/** Retire les rappels hérités d'un ancien compte sans toucher aux autres alertes. */
export async function pruneGroupEventRemindersForAccount(
  currentUserId: string | null,
  notifications: EventReminderNotificationsApi = Notifications,
): Promise<number> {
  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  const stale = scheduled
    .map((request) => request.identifier)
    .filter(
      (identifier) =>
        isManagedIdentifier(identifier) &&
        (currentUserId === null || !belongsToAccount(identifier, currentUserId)),
    );
  return cancelIdentifiers(notifications, stale);
}

let reconciliationQueue: Promise<unknown> = Promise.resolve();

/** Sérialise les synchros rapides (realtime + mutation + retour au premier plan). */
export function enqueueGroupEventReminderReconciliation(
  input: ReconcileGroupEventRemindersInput,
): Promise<ReconcileGroupEventRemindersResult> {
  const run = reconciliationQueue
    .catch(() => undefined)
    .then(() => reconcileGroupEventReminders(input));
  reconciliationQueue = run;
  return run;
}
