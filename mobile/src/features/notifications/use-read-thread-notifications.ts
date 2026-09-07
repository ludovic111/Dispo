import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { notificationKeys } from './notification-queries';
import {
  markThreadNotificationsRead,
  subscribeToThreadNotifications,
} from './notification-repository';

import { useAuth } from '@/features/auth/auth-context';

/** Use the server timestamp of the latest loaded message, never the device clock. */
export function useReadThreadNotifications(
  source: 'group_messages' | 'messages',
  threadId: string,
  through: string | undefined,
  active: boolean,
) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  useEffect(() => {
    if (!active || !userId || !threadId || !through) return;
    let cancelled = false;
    let running = false;
    let pending = false;
    const acknowledge = async () => {
      if (cancelled) return;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      do {
        pending = false;
        try {
          await markThreadNotificationsRead(source, threadId, through);
          await client.invalidateQueries({
            queryKey: notificationKeys.all(userId),
            refetchType: 'active',
          });
        } catch {
          // Keep the unread state on failure; retry on focus, reconnect or the next message.
        }
      } while (pending && !cancelled);
      running = false;
    };
    // Notification INSERT delivery can arrive after its message was already rendered.
    const stop = subscribeToThreadNotifications(userId, source, threadId, () => void acknowledge());
    void acknowledge();
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, client, source, threadId, through, userId]);
}
