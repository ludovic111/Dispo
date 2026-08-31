import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import {
  notificationData,
  notificationDestination,
  normalizeNotificationCategory,
  type AppNotification,
} from './notification-model';
import { notificationKeys, useNotificationUnreadCount } from './notification-queries';
import { markNotificationRead } from './notification-repository';

import { useAuth } from '@/features/auth/auth-context';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Json } from '@/services/supabase/database.types';
import { uniqueRealtimeTopic } from '@/services/supabase/realtime-topic';

function responseDestination(response: Notifications.NotificationResponse): string {
  const raw = response.notification.request.content.data as Json;
  const data = notificationData(raw);
  const category = normalizeNotificationCategory(
    data.category ??
      data.target_tab ??
      response.notification.request.content.categoryIdentifier ??
      '',
  );
  const notification: AppNotification = {
    body: response.notification.request.content.body ?? '',
    category,
    createdAt: new Date(response.notification.date).toISOString(),
    data,
    id: data.notification_id ?? response.notification.request.identifier,
    readAt: null,
    title: response.notification.request.content.title ?? '',
  };
  return notificationDestination(notification);
}

export function NativeNotificationBridge() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const unreadQuery = useNotificationUnreadCount();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    // Pixel Launcher owns Android notification dots and rejects numeric badge
    // broadcasts. Explicit badge counts are supported only on iOS here.
    if (Platform.OS !== 'ios' || unreadQuery.data === undefined) return;
    void Notifications.setBadgeCountAsync(unreadQuery.data).catch(() => undefined);
  }, [unreadQuery.data]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(uniqueRealtimeTopic(`notifications:${userId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `user_id=eq.${userId}`,
          schema: 'public',
          table: 'push_notifications',
        },
        () =>
          void queryClient.invalidateQueries({
            queryKey: notificationKeys.all(userId),
            refetchType: 'active',
          }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, session?.user.id]);

  useEffect(() => {
    if (!session) return;
    const open = (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      if (handled.current.has(identifier)) return;
      handled.current.add(identifier);
      const data = notificationData(response.notification.request.content.data as Json);
      if (data.notification_id) {
        void markNotificationRead(session.user.id, data.notification_id)
          .then(() =>
            queryClient.invalidateQueries({
              queryKey: notificationKeys.all(session.user.id),
            }),
          )
          .catch(() => undefined);
      }
      router.push(responseDestination(response) as never);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response);
    });
    return () => subscription.remove();
  }, [queryClient, session]);

  return null;
}
