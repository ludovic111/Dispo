import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { GroupMessage } from '@/features/groups/group-model';
import {
  groupKeys,
  patchGroupMessageCache,
  type GroupMessageCache,
} from '@/features/groups/group-queries';
import {
  fetchGroupMessagesPage,
  subscribeToGroupMessages,
  subscribeToGroupMessageSummaries,
  subscribeToGroupTyping,
  subscribeToGroups,
} from '@/features/groups/group-repository';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockedClient = jest.mocked(getSupabaseClient);

function message(id: string, createdAt: string, text = id): GroupMessage {
  return {
    attachmentName: null,
    attachmentPath: null,
    attachmentSize: null,
    attachmentType: null,
    createdAt,
    deletedAt: null,
    editedAt: null,
    groupId: 'group-1',
    id,
    reactions: [],
    senderId: 'profile-a',
    senderName: 'Alice',
    senderPhotoUrl: null,
    text,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('repository paginé des messages de groupe', () => {
  it('borne la page, applique l’ordre stable et hydrate seulement profils/réactions chargés', async () => {
    const rows = [
      {
        attachment_name: null,
        attachment_path: null,
        attachment_size: null,
        attachment_type: null,
        created_at: '2026-09-02T10:00:00Z',
        deleted_at: null,
        edited_at: null,
        group_id: 'group-1',
        id: 'message-b',
        sender_id: 'profile-a',
        text: 'B',
      },
      {
        attachment_name: null,
        attachment_path: null,
        attachment_size: null,
        attachment_type: null,
        created_at: '2026-09-02T10:00:00Z',
        deleted_at: null,
        edited_at: null,
        group_id: 'group-1',
        id: 'message-a',
        sender_id: 'profile-a',
        text: 'A',
      },
      {
        attachment_name: null,
        attachment_path: null,
        attachment_size: null,
        attachment_type: null,
        created_at: '2026-09-01T10:00:00Z',
        deleted_at: null,
        edited_at: null,
        group_id: 'group-1',
        id: 'message-old',
        sender_id: 'profile-a',
        text: 'old',
      },
    ];
    const range = jest.fn(async () => ({ data: rows, error: null }));
    const orderById = jest.fn(() => ({ range }));
    const orderByDate = jest.fn(() => ({ order: orderById }));
    const messageEq = jest.fn(() => ({ order: orderByDate }));
    const reactionIs = jest.fn(async () => ({
      data: [
        {
          created_at: '2026-09-02T10:01:00Z',
          emoji: '👍',
          message_id: 'message-b',
          profile_id: 'me',
          removed_at: null,
        },
      ],
      error: null,
    }));
    const reactionIn = jest.fn(() => ({ is: reactionIs }));
    const profileIn = jest.fn(async () => ({
      data: [{ id: 'profile-a', instruments: ['Piano'], name: 'Alice', photo_url: null }],
      error: null,
    }));
    const from = jest.fn((table: string) => {
      if (table === 'group_messages') return { select: () => ({ eq: messageEq }) };
      if (table === 'group_message_reactions') return { select: () => ({ in: reactionIn }) };
      if (table === 'profiles') return { select: () => ({ in: profileIn }) };
      throw new Error(`unexpected table ${table}`);
    });
    mockedClient.mockReturnValue({ from } as never);

    await expect(fetchGroupMessagesPage('group-1', 'me', 0, 2)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'message-b',
          reactions: [{ count: 1, emoji: '👍', reactedByMe: true }],
          senderName: 'Alice',
        }),
        expect.objectContaining({ id: 'message-a', senderName: 'Alice' }),
      ],
      nextPage: 1,
    });
    expect(orderByDate).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(orderById).toHaveBeenCalledWith('id', { ascending: false });
    expect(range).toHaveBeenCalledWith(0, 2);
    expect(reactionIn).toHaveBeenCalledWith('message_id', ['message-b', 'message-a']);
    expect(profileIn).toHaveBeenCalledWith('id', ['profile-a']);
  });

  it('filtre messages et réactions côté Realtime, puis garde le typing éphémère', () => {
    const on =
      jest.fn<(type: string, config: Record<string, unknown>, callback: unknown) => unknown>();
    const subscribe = jest.fn<(callback?: (status: string) => void) => unknown>();
    const channel = {
      on,
      send: jest.fn(async () => 'ok'),
      subscribe,
    };
    on.mockImplementation(() => channel);
    subscribe.mockImplementation((callback) => {
      callback?.('SUBSCRIBED');
      return channel;
    });
    const removeChannel = jest.fn(async () => 'ok');
    const createChannel = jest.fn<(topic: string) => typeof channel>(() => channel);
    mockedClient.mockReturnValue({ channel: createChannel, removeChannel } as never);

    const controller = subscribeToGroupMessages(
      'group-1',
      'profile-me',
      ['message-2', 'message-1', 'message-1'],
      jest.fn(),
      jest.fn(),
    );
    const postgresConfigs = on.mock.calls
      .filter((call) => call[0] === 'postgres_changes')
      .map((call) => call[1]);
    expect(postgresConfigs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filter: 'group_id=eq.group-1',
          table: 'group_messages',
        }),
        expect.objectContaining({
          filter: 'message_id=in.(message-1,message-2)',
          table: 'group_message_reactions',
        }),
      ]),
    );
    expect(
      postgresConfigs.every(
        (config) => config.table !== 'group_message_reactions' || Boolean(config.filter),
      ),
    ).toBe(true);
    expect(createChannel.mock.calls[0]?.[0]).toMatch(/^group-messages-db:group-1:client-/);
    const typing = subscribeToGroupTyping('group-1', 'profile-me', jest.fn());
    expect(createChannel).toHaveBeenLastCalledWith('group-messages:group-1');
    typing.sendTyping();
    expect(channel.send).toHaveBeenCalledWith({
      event: 'typing',
      payload: { user_id: 'profile-me' },
      type: 'broadcast',
    });
    typing.unsubscribe();
    controller.unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it('filtre aussi les résumés par groupe et retire les messages du flux global', () => {
    const on =
      jest.fn<(type: string, config: Record<string, unknown>, callback: unknown) => unknown>();
    const subscribe = jest.fn<() => unknown>();
    const channel = { on, subscribe };
    on.mockImplementation(() => channel);
    subscribe.mockImplementation(() => channel);
    const removeChannel = jest.fn(async () => 'ok');
    mockedClient.mockReturnValue({ channel: jest.fn(() => channel), removeChannel } as never);
    const groupIds = Array.from(
      { length: 101 },
      (_, index) => `group-${String(index + 1).padStart(3, '0')}`,
    );

    const stopSummaries = subscribeToGroupMessageSummaries(
      [...groupIds, groupIds[0]!],
      'profile-me',
      jest.fn(),
    );
    const summaryConfigs = on.mock.calls
      .filter((call) => call[0] === 'postgres_changes')
      .map((call) => call[1]);
    expect(summaryConfigs).toHaveLength(4);
    expect(
      summaryConfigs.every((config) => config.table === 'group_messages' && Boolean(config.filter)),
    ).toBe(true);
    const summaryFilters = summaryConfigs.map((config) => config.filter);
    expect(new Set(summaryFilters).size).toBe(2);
    expect(summaryFilters).toContain('group_id=eq.group-101');
    expect(summaryFilters.some((filter) => /^group_id=in\.\(group-001,/.test(String(filter)))).toBe(
      true,
    );
    stopSummaries();

    on.mockClear();
    const stopGroups = subscribeToGroups('profile-me', jest.fn());
    const globalTables = on.mock.calls.map((call) => call[1].table);
    expect(globalTables).not.toContain('group_messages');
    expect(globalTables).not.toContain('group_message_reactions');
    stopGroups();
    expect(removeChannel).toHaveBeenCalledTimes(2);
  });

  it('isole les topics Postgres quand deux consommateurs se montent ensemble', () => {
    const makeChannel = () => {
      const channel = {
        on: jest.fn<(type: string) => unknown>(),
        subscribe: jest.fn<() => unknown>(),
        subscribed: false,
      };
      channel.on.mockImplementation((type) => {
        if (type === 'postgres_changes' && channel.subscribed)
          throw new Error(`cannot add ${type} callbacks after subscribe().`);
        return channel;
      });
      channel.subscribe.mockImplementation(() => {
        channel.subscribed = true;
        return channel;
      });
      return channel;
    };
    const channels = new Map<string, ReturnType<typeof makeChannel>>();
    const createChannel = jest.fn<(topic: string) => ReturnType<typeof makeChannel>>((topic) => {
      const existing = channels.get(topic);
      if (existing) return existing;
      const channel = makeChannel();
      channels.set(topic, channel);
      return channel;
    });
    mockedClient.mockReturnValue({
      channel: createChannel,
      removeChannel: jest.fn(async () => 'ok'),
    } as never);

    const stopFirst = subscribeToGroups('profile-me', jest.fn());
    const stopSecond = subscribeToGroups('profile-me', jest.fn());
    const [firstTopic, secondTopic] = createChannel.mock.calls.map(([topic]) => topic);

    expect(firstTopic).toMatch(/^groups:profile-me:client-/);
    expect(secondTopic).toMatch(/^groups:profile-me:client-/);
    expect(firstTopic).not.toBe(secondTopic);

    stopFirst();
    stopSecond();
  });
});

describe('cache de query isolé et dédupliqué', () => {
  it('encode le compte et le groupe dans la clé de thread', () => {
    expect(groupKeys.messages('account-a', 'group-1')).not.toEqual(
      groupKeys.messages('account-b', 'group-1'),
    );
    expect(groupKeys.messages('account-a', 'group-1')).not.toEqual(
      groupKeys.messages('account-a', 'group-2'),
    );
  });

  it('fusionne un écho INSERT une seule fois même s’il existe dans une page plus ancienne', () => {
    const cachedEcho: GroupMessage = {
      ...message('echo', '2026-09-01T10:00:00Z', 'ancien'),
      reactions: [{ count: 2, emoji: '👍', reactedByMe: true }],
      senderName: 'Alice enrichie',
      senderPhotoUrl: 'https://example.com/alice.jpg',
    };
    const cache: GroupMessageCache = {
      pageParams: [0, 1],
      pages: [
        { items: [message('new', '2026-09-02T10:00:00Z')], nextPage: 1 },
        { items: [cachedEcho], nextPage: null },
      ],
    };
    const incoming: GroupMessage = {
      ...message('echo', '2026-09-01T10:00:00Z', 'mis à jour'),
      senderName: 'Membre',
    };
    const patched = patchGroupMessageCache(cache, incoming, true);
    const flattened = patched?.pages.flatMap((page) => page.items) ?? [];
    expect(flattened.filter((item) => item.id === 'echo')).toHaveLength(1);
    expect(flattened.find((item) => item.id === 'echo')).toEqual(
      expect.objectContaining({
        reactions: cachedEcho.reactions,
        senderName: cachedEcho.senderName,
        senderPhotoUrl: cachedEcho.senderPhotoUrl,
        text: 'mis à jour',
      }),
    );
  });

  it('ignore l’UPDATE d’un ancien message qui ne fait pas partie des pages chargées', () => {
    const cache: GroupMessageCache = {
      pageParams: [0],
      pages: [{ items: [message('visible', '2026-09-02T10:00:00Z')], nextPage: 1 }],
    };
    const patched = patchGroupMessageCache(
      cache,
      message('not-loaded', '2026-01-01T10:00:00Z'),
      false,
    );
    expect(patched?.pages[0]?.items.map((item) => item.id)).toEqual(['visible']);
  });
});
