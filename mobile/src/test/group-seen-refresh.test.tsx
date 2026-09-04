import { expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { MusicGroup } from '@/features/groups/group-model';
import { groupKeys, useGroupUnreadState } from '@/features/groups/group-queries';
import { loadAndSeedGroupSeen } from '@/features/groups/group-seen-store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/features/groups/group-seen-store', () => ({
  ...jest.requireActual<typeof import('@/features/groups/group-seen-store')>(
    '@/features/groups/group-seen-store',
  ),
  loadAndSeedGroupSeen: jest.fn(async () => ({ group: '2026-09-04T10:00:00Z' })),
}));
it('does not reread storage for messages or metadata changes, but seeds new groups', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(groupKeys.seen('me'), { group: '2026-09-04T10:00:00Z' });
  const group = { id: 'group', messages: [] } as unknown as MusicGroup;
  const view = await renderHook(
    ({ groups }: { groups: MusicGroup[] }) => useGroupUnreadState(groups),
    {
      initialProps: { groups: [group] },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(loadAndSeedGroupSeen).toHaveBeenCalledTimes(1));
  await view.rerender({
    groups: [
      {
        ...group,
        name: 'Updated',
        messages: [
          {
            id: 'new',
            senderId: 'other',
            deletedAt: null,
            createdAt: '2026-09-04T11:00:00Z',
          } as MusicGroup['messages'][number],
        ],
      },
    ],
  });
  expect(view.result.current.total).toBe(1);
  expect(loadAndSeedGroupSeen).toHaveBeenCalledTimes(1);
  await view.rerender({ groups: [group, { ...group, id: 'second' }] });
  await waitFor(() => expect(loadAndSeedGroupSeen).toHaveBeenCalledWith('me', ['group', 'second']));
  await view.unmount();
  client.clear();
});
