import type { InfiniteData } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { formatSwiftPlaceholders } from '@/i18n/format';
import { formatRelativeTime, type RelativeTimeUnit } from '@/i18n/relative-time';
import type { Json } from '@/services/supabase/database.types';

export type NotificationCategory = 'groups' | 'messages' | 'sos' | 'unknown';

export interface AppNotification {
  body: string;
  category: NotificationCategory;
  createdAt: string;
  data: Record<string, string>;
  id: string;
  readAt: string | null;
  title: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextPage: number | null;
  totalCount: number;
}

export type NotificationCache = InfiniteData<NotificationPage, number>;

/**
 * Offset pages can overlap when a Realtime insert lands while older pages are
 * loading. The visible timeline always keeps the newest occurrence of an id.
 */
export function notificationItems(cache: NotificationCache | undefined): AppNotification[] {
  const seen = new Set<string>();
  return (cache?.pages ?? []).flatMap((page) =>
    page.items.filter((notification) => {
      if (seen.has(notification.id)) return false;
      seen.add(notification.id);
      return true;
    }),
  );
}

export function optimisticNotificationRead(
  cache: NotificationCache | undefined,
  predicate: (notification: AppNotification) => boolean,
  readAt = new Date().toISOString(),
): NotificationCache | undefined {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      items: page.items.map((notification) =>
        predicate(notification) && !notification.readAt
          ? { ...notification, readAt }
          : notification,
      ),
    })),
  };
}

export function normalizeNotificationCategory(value: string): NotificationCategory {
  if (value === 'sos') return 'sos';
  if (value === 'message' || value === 'messages') return 'messages';
  if (value === 'group' || value === 'groups') return 'groups';
  return 'unknown';
}

export function notificationData(value: Json): Record<string, string> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
        ? [[key, String(entry)]]
        : [],
    ),
  );
}

export function notificationDestination(notification: AppNotification): string {
  const gigId = notification.data.gig_id;
  if (gigId) return `/gigs/${gigId}`;
  const conversationId = notification.data.conversation_id;
  if (conversationId) return `/messages/${conversationId}`;
  const schoolId = notification.data.school_id;
  if (schoolId) return `/schools/${schoolId}/community`;
  const groupId = notification.data.group_id;
  const isGroupInvitation =
    notification.data.source_table === 'group_invitations' ||
    notification.data.invitation_id !== undefined ||
    notification.title.toLowerCase().includes('invitation');
  if (groupId && isGroupInvitation) return '/(tabs)/messages?segment=groups';
  if (groupId) return `/groups/${groupId}`;

  const target = notification.data.target_tab ?? notification.category;
  if (target === 'sos') {
    const sourceId = notification.data.source_id;
    return sourceId ? `/gigs/${sourceId}` : '/(tabs)/sos';
  }
  if (target === 'message' || target === 'messages') {
    return '/(tabs)/messages';
  }
  if (target === 'groups' || target === 'group') return '/(tabs)/messages';
  if (target === 'agenda' || target === 'sessions') return '/(tabs)/sessions';
  if (target === 'profile') return '/(tabs)/profile';
  return '/(tabs)';
}

export function localizedNotificationText(value: string, t: TFunction): string {
  switch (value) {
    case 'Nouveau SOS compatible':
      return t('Nouveau SOS compatible');
    case 'Nouvelle candidature':
      return t('Nouvelle candidature');
    case 'Nouvel événement de groupe':
      return t('Nouvel événement de groupe');
    case 'Dépannage accepté':
      return t('Dépannage accepté');
    case 'Dépannage refusé':
      return t('Dépannage refusé');
    case 'Tu es pris·e !':
      return t('Tu es pris·e !');
    case 'Poste pourvu':
      return t('Poste pourvu');
    case 'Demande de dépannage':
      return t('Demande de dépannage');
    case '🎶 Invitation à un groupe':
      return t('🎶 Invitation à un groupe');
    case 'Une date a changé':
      return t('Une date a changé');
    case 'Sessions annulées':
      return t('Sessions annulées');
    case 'Session annulée':
      return t('Session annulée');
    case 'Message supprimé':
    case 'Message supprime':
      return t('Message supprimé');
    case 'Details disponibles dans Dispo':
      return t('Détails disponibles dans Dispo');
    case 'Ecole de musique':
      return t('École de musique');
    case 'Nouveau message dans la communaute':
      return t('Nouveau message dans la communauté');
    default:
      break;
  }

  const directRequest = /^(.+) te demande de dépanner : (.+)$/u.exec(value);
  if (directRequest?.[1] && directRequest[2]) {
    return `${formatSwiftPlaceholders(t('%@ te demande de dépanner'), directRequest[1])} : ${directRequest[2]}`;
  }
  return value;
}

export function relativeNotificationDate(value: string, locale: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: { divisor: number; unit: RelativeTimeUnit }[] = [
    { divisor: 86_400, unit: 'day' },
    { divisor: 3_600, unit: 'hour' },
    { divisor: 60, unit: 'minute' },
  ];
  for (const item of units) {
    if (Math.abs(seconds) >= item.divisor || item.unit === 'minute') {
      return formatRelativeTime(seconds / item.divisor, item.unit, locale);
    }
  }
  return formatRelativeTime(0, 'minute', locale);
}
