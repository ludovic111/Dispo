import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  optimisticNotificationRead,
  type NotificationCache,
  type NotificationPage,
} from './notification-model';
import {
  fetchNotificationsPage,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_PAGE_SIZE,
} from './notification-repository';

import { useAuth } from '@/features/auth/auth-context';

export const notificationKeys = {
  all: (userId: string) => ['notifications', userId] as const,
  list: (userId: string) => [...notificationKeys.all(userId), 'list'] as const,
  unread: (userId: string) => [...notificationKeys.all(userId), 'unread'] as const,
};

export function useNotifications() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useInfiniteQuery<
    NotificationPage,
    Error,
    InfiniteData<NotificationPage, number>,
    ReturnType<typeof notificationKeys.list>,
    number
  >({
    enabled: Boolean(userId),
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchNotificationsPage(userId, pageParam, NOTIFICATION_PAGE_SIZE, signal),
    queryKey: notificationKeys.list(userId),
  });
}

export function useNotificationUnreadCount() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchUnreadNotificationCount(userId, signal),
    queryKey: notificationKeys.unread(userId),
  });
}

export function useMarkNotificationRead() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const queryKey = notificationKeys.list(userId);
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(userId, id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all(userId) });
      const previous = queryClient.getQueryData<NotificationCache>(queryKey);
      const previousUnread = queryClient.getQueryData<number>(notificationKeys.unread(userId));
      const wasUnread = previous?.pages.some((page) =>
        page.items.some((item) => item.id === id && !item.readAt),
      );
      queryClient.setQueryData(
        queryKey,
        optimisticNotificationRead(previous, (item) => item.id === id),
      );
      if (wasUnread && previousUnread !== undefined) {
        queryClient.setQueryData(notificationKeys.unread(userId), Math.max(0, previousUnread - 1));
      }
      return { previous, previousUnread };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      queryClient.setQueryData(notificationKeys.unread(userId), context?.previousUnread);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: notificationKeys.all(userId),
        refetchType: 'active',
      }),
  });
}

export function useMarkAllNotificationsRead() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const queryKey = notificationKeys.list(userId);
  return useMutation({
    mutationFn: () => markAllNotificationsRead(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all(userId) });
      const previous = queryClient.getQueryData<NotificationCache>(queryKey);
      const previousUnread = queryClient.getQueryData<number>(notificationKeys.unread(userId));
      queryClient.setQueryData(
        queryKey,
        optimisticNotificationRead(previous, () => true),
      );
      queryClient.setQueryData(notificationKeys.unread(userId), 0);
      return { previous, previousUnread };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      queryClient.setQueryData(notificationKeys.unread(userId), context?.previousUnread);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: notificationKeys.all(userId),
        refetchType: 'active',
      }),
  });
}
