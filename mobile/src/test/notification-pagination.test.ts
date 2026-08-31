import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { InfiniteData } from '@tanstack/react-query';

import {
  notificationItems,
  optimisticNotificationRead,
  type AppNotification,
  type NotificationPage,
} from '@/features/notifications/notification-model';
import { notificationKeys } from '@/features/notifications/notification-queries';
import {
  fetchNotificationsPage,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/features/notifications/notification-repository';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    body: 'Corps',
    category: 'messages',
    createdAt: '2026-08-31T10:00:00.000Z',
    data: { source_table: 'messages' },
    id: 'notification-1',
    readAt: null,
    title: 'Titre',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('repository paginé des notifications', () => {
  it('demande une plage stable de 50 lignes avec le total exact', async () => {
    const range = jest.fn(async () => ({
      count: 101,
      data: [
        {
          body: 'Corps',
          category: 'message',
          created_at: '2026-08-31T10:00:00.000Z',
          data: { conversation_id: 'conversation-1' },
          id: 'notification-51',
          read_at: null,
          source_table: 'messages',
          title: 'Titre',
        },
      ],
      error: null,
    }));
    const orderId = jest.fn(() => ({ range }));
    const orderCreatedAt = jest.fn(() => ({ order: orderId }));
    const eq = jest.fn(() => ({ order: orderCreatedAt }));
    const select = jest.fn(() => ({ eq }));
    mockedClient.mockReturnValue({ from: jest.fn(() => ({ select })) } as never);

    await expect(fetchNotificationsPage('user-1', 1)).resolves.toEqual({
      items: [
        expect.objectContaining({
          category: 'messages',
          data: { conversation_id: 'conversation-1', source_table: 'messages' },
          id: 'notification-51',
        }),
      ],
      nextPage: 2,
      totalCount: 101,
    });
    expect(select).toHaveBeenCalledWith(
      'id,category,title,body,data,created_at,read_at,source_table',
      { count: 'exact' },
    );
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(orderCreatedAt).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(orderId).toHaveBeenCalledWith('id', { ascending: false });
    expect(range).toHaveBeenCalledWith(50, 99);
  });

  it('compte les non-lues exactement sans télécharger leur contenu', async () => {
    const is = jest.fn(async () => ({ count: 237, data: null, error: null }));
    const eq = jest.fn(() => ({ is }));
    const select = jest.fn(() => ({ eq }));
    mockedClient.mockReturnValue({ from: jest.fn(() => ({ select })) } as never);

    await expect(fetchUnreadNotificationCount('user-1')).resolves.toBe(237);
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(is).toHaveBeenCalledWith('read_at', null);
  });

  it('borne les mutations de lecture au propriétaire authentifié', async () => {
    const readOwner = jest.fn(async () => ({ error: null }));
    const readId = jest.fn(() => ({ eq: readOwner }));
    const readUpdate = jest.fn(() => ({ eq: readId }));
    mockedClient.mockReturnValue({
      from: jest.fn(() => ({ update: readUpdate })),
    } as never);
    await markNotificationRead('user-1', 'notification-1');
    expect(readId).toHaveBeenCalledWith('id', 'notification-1');
    expect(readOwner).toHaveBeenCalledWith('user_id', 'user-1');

    const allUnread = jest.fn(async () => ({ error: null }));
    const allOwner = jest.fn(() => ({ is: allUnread }));
    const allUpdate = jest.fn(() => ({ eq: allOwner }));
    mockedClient.mockReturnValue({
      from: jest.fn(() => ({ update: allUpdate })),
    } as never);
    await markAllNotificationsRead('user-1');
    expect(allOwner).toHaveBeenCalledWith('user_id', 'user-1');
    expect(allUnread).toHaveBeenCalledWith('read_at', null);
  });
});

describe('cache paginé et clés de requête', () => {
  it('déduplique les chevauchements Realtime entre pages sans changer leur ordre', () => {
    const duplicate = notification();
    const older = notification({
      createdAt: '2026-08-30T10:00:00.000Z',
      id: 'notification-older',
    });
    const cache: InfiniteData<NotificationPage, number> = {
      pageParams: [0, 1],
      pages: [
        { items: [duplicate], nextPage: 1, totalCount: 2 },
        { items: [duplicate, older], nextPage: null, totalCount: 2 },
      ],
    };

    expect(notificationItems(cache).map((item) => item.id)).toEqual([
      'notification-1',
      'notification-older',
    ]);
  });

  it('marque optimistement chaque occurrence chargée tout en préservant la pagination', () => {
    const cache: InfiniteData<NotificationPage, number> = {
      pageParams: [0, 1],
      pages: [
        { items: [notification()], nextPage: 1, totalCount: 2 },
        { items: [notification()], nextPage: null, totalCount: 2 },
      ],
    };
    const patched = optimisticNotificationRead(
      cache,
      (item) => item.id === 'notification-1',
      '2026-08-31T11:00:00.000Z',
    );

    expect(patched?.pages.flatMap((page) => page.items).map((item) => item.readAt)).toEqual([
      '2026-08-31T11:00:00.000Z',
      '2026-08-31T11:00:00.000Z',
    ]);
    expect(patched?.pageParams).toBe(cache.pageParams);
    expect(cache.pages[0]?.items[0]?.readAt).toBeNull();
  });

  it('sépare la liste infinie du compteur exact sous une même racine Realtime', () => {
    expect(notificationKeys.all('user-1')).toEqual(['notifications', 'user-1']);
    expect(notificationKeys.list('user-1')).toEqual(['notifications', 'user-1', 'list']);
    expect(notificationKeys.unread('user-1')).toEqual(['notifications', 'user-1', 'unread']);
  });
});
