import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { notificationKeys } from '@/features/notifications/notification-queries';
import { NotificationsCenterScreen } from '@/features/notifications/notifications-center-screen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismiss: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]);
  },
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
  }: {
    data: { id: string }[];
    renderItem: (item: { item: unknown }) => ReactNode;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    return data.map((item) =>
      React.createElement(React.Fragment, { key: item.id }, renderItem({ item })),
    );
  },
}));
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user' } } }),
}));
jest.mock('@/components/ui/screen', () => ({
  Screen: ({ children }: { children: ReactNode }) => children,
  EmptyState: () => null,
  LoadingState: () => null,
  ErrorState: () => null,
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));
const mockFetch = jest.fn(async () => ({
  items: [
    {
      id: 'new',
      category: 'groups',
      title: 'Nouvelle session',
      body: 'Une répétition vient d’arriver.',
      readAt: null,
      createdAt: new Date().toISOString(),
      data: {},
    },
  ],
  nextPage: null,
  totalCount: 1,
}));
const mockCount = jest.fn(async () => 1);
jest.mock('@/features/notifications/notification-repository', () => ({
  fetchNotificationsPage: () => mockFetch(),
  fetchUnreadNotificationCount: () => mockCount(),
  markAllNotificationsRead: jest.fn(),
  markNotificationRead: jest.fn(),
  NOTIFICATION_PAGE_SIZE: 50,
}));

describe('notification center entry', () => {
  it('refreshes even a fresh empty cache and keeps arrivals visible when reopened', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    client.setQueryData(notificationKeys.list('user'), {
      pages: [{ items: [], nextPage: null, totalCount: 0 }],
      pageParams: [0],
    });
    client.setQueryData(notificationKeys.unread('user'), 0);
    const open = () =>
      render(
        <QueryClientProvider client={client}>
          <NotificationsCenterScreen />
        </QueryClientProvider>,
      );
    const first = await open();
    await waitFor(() => expect(first.getByText('Nouvelle session')).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(notificationKeys.unread('user'))).toBe(1);
    await first.unmount();
    const second = await open();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(second.getByText('Nouvelle session')).toBeTruthy();
    await second.unmount();
    client.clear();
  });
});
