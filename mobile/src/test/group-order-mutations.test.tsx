import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { reorderGroupEventSetlist } from '@/features/groups/group-event-repository';
import type { GroupEvent, GroupSong, MusicGroup } from '@/features/groups/group-model';
import {
  groupKeys,
  useReorderGroupEventSetlist,
  useReorderGroupRepertoire,
} from '@/features/groups/group-queries';
import { reorderGroupRepertoire } from '@/features/groups/group-repository';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'leader' } } }),
}));

jest.mock('@/features/groups/group-event-repository', () => ({
  reorderGroupEventSetlist: jest.fn(),
}));

jest.mock('@/features/groups/group-repository', () => ({
  reorderGroupRepertoire: jest.fn(),
}));

const reorderEventMock = jest.mocked(reorderGroupEventSetlist);
const reorderRepertoireMock = jest.mocked(reorderGroupRepertoire);

function song(id: string, isApproved = true): GroupSong {
  return {
    albumTitle: null,
    artist: 'Artiste',
    artworkUrl: null,
    canonicalSongId: null,
    catalogId: null,
    chords: null,
    composer: null,
    durationMilliseconds: null,
    form: null,
    genre: null,
    genres: [],
    id,
    irealDisabled: false,
    irealUrl: null,
    isApproved,
    isrc: null,
    key: null,
    metadataSource: null,
    metadataUpdatedAt: null,
    platformIds: {},
    platformLinks: {},
    previewUrl: null,
    releaseYear: null,
    solos: [],
    suggestedBy: 'member',
    tempoBpm: null,
    title: id,
    trackUrl: null,
  };
}

function event(setlist: GroupSong[]): GroupEvent {
  return {
    attendance: [],
    date: '2026-09-01T18:00:00.000Z',
    exactAddress: null,
    groupId: 'group-1',
    id: 'event-1',
    kind: 'Concert',
    privateLocationState: 'absent',
    publicLocationLabel: 'Genève',
    recurrence: null,
    reminderLeadDays: null,
    seriesId: null,
    setlist,
    title: 'Concert',
    venue: 'Genève',
  };
}

function group(): MusicGroup {
  const songs = [song('a'), song('pending', false), song('b')];
  return {
    autoSosEnabled: false,
    autoSosMinLevel: null,
    comments: [],
    documents: [],
    emoji: '🎷',
    events: [event(songs)],
    id: 'group-1',
    isPublic: false,
    leaderId: 'leader',
    members: [],
    messages: [],
    name: 'Blue Notes',
    pendingInvitations: [],
    photoUrl: null,
    repertoire: songs,
  };
}

function deferredFailure() {
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

function order(client: QueryClient, source: 'event' | 'repertoire') {
  const current = client.getQueryData<MusicGroup[]>(groupKeys.list('leader'))?.[0];
  const songs = source === 'event' ? current?.events[0]?.setlist : current?.repertoire;
  return songs?.map((item) => item.id);
}

describe('mutations de réordonnancement', () => {
  beforeEach(() => {
    reorderEventMock.mockReset();
    reorderRepertoireMock.mockReset();
  });

  it('affiche le nouvel ordre du répertoire puis restaure le snapshot si le RPC échoue', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: Infinity, retry: 0 }, queries: { gcTime: Infinity } },
    });
    client.setQueryData(groupKeys.list('leader'), [group()]);
    const failure = deferredFailure();
    reorderRepertoireMock.mockReturnValueOnce(failure.promise);
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = await renderHook(() => useReorderGroupRepertoire(), { wrapper });

    await act(async () => {
      result.current.mutate({ groupId: 'group-1', songIds: ['b', 'a'] });
      await Promise.resolve();
    });
    await waitFor(() => expect(order(client, 'repertoire')).toEqual(['b', 'pending', 'a']));

    await act(async () => {
      failure.reject(new Error('network'));
      await Promise.resolve();
    });
    await waitFor(() => expect(order(client, 'repertoire')).toEqual(['a', 'pending', 'b']));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    await unmount();
    client.clear();
  });

  it('affiche le nouvel ordre de setlist puis restaure le snapshot si le RPC échoue', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: Infinity, retry: 0 }, queries: { gcTime: Infinity } },
    });
    client.setQueryData(groupKeys.list('leader'), [group()]);
    const failure = deferredFailure();
    reorderEventMock.mockReturnValueOnce(failure.promise);
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = await renderHook(() => useReorderGroupEventSetlist(), { wrapper });

    await act(async () => {
      result.current.mutate({ eventId: 'event-1', songIds: ['b', 'a'] });
      await Promise.resolve();
    });
    await waitFor(() => expect(order(client, 'event')).toEqual(['b', 'pending', 'a']));

    await act(async () => {
      failure.reject(new Error('network'));
      await Promise.resolve();
    });
    await waitFor(() => expect(order(client, 'event')).toEqual(['a', 'pending', 'b']));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    await unmount();
    client.clear();
  });
});
