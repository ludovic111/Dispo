import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';

import type { MusicGroup } from '@/features/groups/group-model';
import { groupKeys, useLeaveGroup } from '@/features/groups/group-queries';
import { leaveGroup } from '@/features/groups/group-repository';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'member' } } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/features/groups/group-event-repository', () => ({}));
jest.mock('@/features/groups/group-repository', () => ({ leaveGroup: jest.fn() }));

const leaveMock = jest.mocked(leaveGroup);
const replaceMock = jest.mocked(router.replace);

function group(id: string): MusicGroup {
  return {
    autoSosEnabled: false,
    autoSosMinLevel: null,
    comments: [],
    documents: [],
    emoji: '🎷',
    events: [],
    id,
    isPublic: false,
    leaderId: 'leader',
    members: [],
    messages: [],
    name: id,
    pendingInvitations: [],
    photoUrl: null,
    repertoire: [],
  };
}

describe('useLeaveGroup', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { gcTime: Infinity, retry: false },
        queries: { gcTime: Infinity },
      },
    });
    queryClient.setQueryData(groupKeys.list('member'), [group('a'), group('b')]);
    queryClient.setQueryData(groupKeys.messages('member', 'a'), { pageParams: [], pages: [] });
    leaveMock.mockReset();
    replaceMock.mockClear();
  });
  afterEach(() => queryClient.clear());

  it('drops the group from the cached list and returns to the groups list', async () => {
    leaveMock.mockResolvedValue(true);
    const { result } = await renderHook(() => useLeaveGroup(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ groupId: 'a' });
    });
    expect(leaveMock).toHaveBeenCalledWith('a');
    expect(
      queryClient.getQueryData<MusicGroup[]>(groupKeys.list('member'))?.map((g) => g.id),
    ).toEqual(['b']);
    expect(queryClient.getQueryData(groupKeys.messages('member', 'a'))).toBeUndefined();
    expect(replaceMock).toHaveBeenCalledWith('/groups');
  });

  it('keeps the cache and stays on the screen when the server refuses (leader)', async () => {
    leaveMock.mockRejectedValue(new Error('leader_must_transfer_or_delete'));
    const { result } = await renderHook(() => useLeaveGroup(), { wrapper });
    act(() => {
      result.current.mutate({ groupId: 'a' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<MusicGroup[]>(groupKeys.list('member'))?.map((g) => g.id),
    ).toEqual(['a', 'b']);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
