import {
  notificationData,
  normalizeNotificationCategory,
  type AppNotification,
  type NotificationPage,
} from './notification-model';

import { pageRange } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';
import { uniqueRealtimeTopic } from '@/services/supabase/realtime-topic';

type NotificationRow = Database['public']['Tables']['push_notifications']['Row'];
type NotificationProjection = Pick<
  NotificationRow,
  'body' | 'category' | 'created_at' | 'data' | 'id' | 'read_at' | 'source_table' | 'title'
>;

export const NOTIFICATION_PAGE_SIZE = 50;

export function mapNotification(row: NotificationProjection): AppNotification {
  return {
    body: row.body,
    category: normalizeNotificationCategory(row.category),
    createdAt: row.created_at,
    data: { ...notificationData(row.data), source_table: row.source_table },
    id: row.id,
    readAt: row.read_at,
    title: row.title,
  };
}

export async function fetchNotificationsPage(
  userId: string,
  page = 0,
  pageSize = NOTIFICATION_PAGE_SIZE,
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('push_notifications')
    .select('id,category,title,body,data,created_at,read_at,source_table', {
      count: 'exact',
    })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const items = (result.data as NotificationProjection[]).map(mapNotification);
  const totalCount = result.count ?? from + items.length;
  const hasNextPage = result.count === null ? items.length === pageSize : to + 1 < result.count;
  return {
    items,
    nextPage: hasNextPage ? page + 1 : null,
    totalCount,
  };
}

export async function fetchUnreadNotificationCount(
  userId: string,
  signal?: AbortSignal,
): Promise<number> {
  const query = getSupabaseClient()
    .from('push_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('push_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('push_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

export async function markThreadNotificationsRead(
  source: 'group_messages' | 'messages',
  threadId: string,
  through: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('mark_thread_notifications_read', {
    p_source_table: source,
    p_thread_id: threadId,
    p_through: through,
  });
  if (error) throw error;
}

export function subscribeToThreadNotifications(
  userId: string,
  source: 'group_messages' | 'messages',
  threadId: string,
  onChange: () => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(uniqueRealtimeTopic(`thread-notifications:${userId}:${threadId}`))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'push_notifications',
        filter: `user_id=eq.${userId}`,
      },
      ({ new: row }) => {
        const data = notificationData(row.data as NotificationRow['data']);
        if (
          row.source_table === source &&
          data[source === 'group_messages' ? 'group_id' : 'conversation_id'] === threadId
        )
          onChange();
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
