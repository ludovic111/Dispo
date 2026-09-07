import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { notificationKeys } from '@/features/notifications/notification-queries';
import {
  markThreadNotificationsRead,
  subscribeToThreadNotifications,
} from '@/features/notifications/notification-repository';
import { useReadThreadNotifications } from '@/features/notifications/use-read-thread-notifications';

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/features/notifications/notification-repository', () => ({
  markThreadNotificationsRead: jest.fn<() => Promise<void>>(),
  subscribeToThreadNotifications: jest.fn(),
}));
const mark = jest.mocked(markThreadNotificationsRead);
const subscribe = jest.mocked(subscribeToThreadNotifications);
const stop = jest.fn();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let notify: () => void;
beforeEach(() => {
  jest.clearAllMocks();
  mark.mockResolvedValue(undefined);
  subscribe.mockImplementation((_user, _source, _thread, callback) => {
    notify = callback;
    return stop;
  });
});
afterEach(() => client.clear());
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

it('clears notifications only after a thread is loaded and visible, then refreshes the bell', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const view = await renderHook(
    ({ active, through }: { active: boolean; through: string | undefined }) =>
      useReadThreadNotifications('group_messages', 'group', through, active),
    { wrapper, initialProps: { active: false, through: undefined } },
  );
  expect(mark).not.toHaveBeenCalled();
  await view.rerender({ active: true, through: undefined });
  expect(mark).not.toHaveBeenCalled();
  await view.rerender({ active: true, through: '2026-09-07T09:00:00Z' });
  await waitFor(() =>
    expect(mark).toHaveBeenCalledWith('group_messages', 'group', '2026-09-07T09:00:00Z'),
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: notificationKeys.all('me'),
    refetchType: 'active',
  });
  await view.rerender({ active: false, through: '2026-09-07T09:00:00Z' });
  expect(stop).toHaveBeenCalledTimes(1);
  await act(() => notify());
  expect(mark).toHaveBeenCalledTimes(1);
  await view.unmount();
  invalidate.mockRestore();
});

it('retries a delayed notification without marking newer unseen messages', async () => {
  const view = await renderHook(
    () => useReadThreadNotifications('messages', 'conversation', '2026-09-07T09:00:00Z', true),
    { wrapper },
  );
  await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
  await act(() => notify());
  await waitFor(() => expect(mark).toHaveBeenCalledTimes(2));
  expect(mark).toHaveBeenLastCalledWith('messages', 'conversation', '2026-09-07T09:00:00Z');
  await view.unmount();
});

it('keeps unread state after a failed acknowledgement and recovers on reconnect', async () => {
  client.setQueryData(notificationKeys.unread('me'), 3);
  mark.mockRejectedValueOnce(new Error('offline'));
  const view = await renderHook(
    () => useReadThreadNotifications('group_messages', 'group', '2026-09-07T09:00:00Z', true),
    { wrapper },
  );
  await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
  expect(client.getQueryData(notificationKeys.unread('me'))).toBe(3);
  await act(() => notify());
  await waitFor(() => expect(mark).toHaveBeenCalledTimes(2));
  await view.unmount();
});
