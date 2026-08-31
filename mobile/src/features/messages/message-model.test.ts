import { describe, expect, it } from '@jest/globals';

import {
  aggregateMessageReactions,
  buildMessageTimeline,
  createPendingMessageAttachment,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  optimisticMessageReactions,
  patchDirectMessageCache,
  receiptForMessage,
  sortConversationActivityCache,
  type DirectMessage,
} from './message-model';

function message(
  id: string,
  createdAt: string,
  overrides: Partial<DirectMessage> = {},
): DirectMessage {
  return {
    attachment: null,
    conversationId: 'conversation-1',
    createdAt,
    deletedAt: null,
    deliveredAt: null,
    editedAt: null,
    id,
    reactions: [],
    readAt: null,
    senderId: 'me',
    text: id,
    ...overrides,
  };
}

describe('présentation des messages directs', () => {
  it('place un séparateur au-dessus de chaque jour dans une liste inversée', () => {
    const timeline = buildMessageTimeline([
      message('newest', '2026-08-31T18:00:00+02:00'),
      message('same-day', '2026-08-31T09:00:00+02:00'),
      message('yesterday', '2026-08-30T22:00:00+02:00'),
    ]);

    expect(timeline.map((item) => item.id)).toEqual([
      'message:newest',
      'message:same-day',
      'day:2026-08-31',
      'message:yesterday',
      'day:2026-08-30',
    ]);
    expect(buildMessageTimeline([], true)).toEqual([{ id: 'typing', kind: 'typing' }]);
  });

  it('dérive envoyé, reçu puis lu depuis les horodatages serveur', () => {
    const sent = message('sent', '2026-08-31T18:00:00+02:00');
    const delivered = { ...sent, deliveredAt: '2026-08-31T18:00:01+02:00' };
    const read = { ...delivered, readAt: '2026-08-31T18:00:02+02:00' };
    expect(receiptForMessage(sent)).toBe('sent');
    expect(receiptForMessage(delivered)).toBe('delivered');
    expect(receiptForMessage(read)).toBe('read');
  });

  it('ne réinjecte jamais un UPDATE ancien hors des pages déjà chargées', () => {
    const loaded = message('loaded', '2026-08-31T18:00:00+02:00');
    const historicalUpdate = message('old', '2026-08-20T18:00:00+02:00', {
      deliveredAt: '2026-08-31T18:00:00+02:00',
    });
    const cache = {
      pageParams: [0],
      pages: [{ items: [loaded], nextPage: 1 }],
    };
    expect(patchDirectMessageCache(cache, historicalUpdate, false)?.pages[0]?.items).toEqual([
      loaded,
    ]);
    expect(patchDirectMessageCache(cache, historicalUpdate, true)?.pages[0]?.items).toEqual([
      historicalUpdate,
      loaded,
    ]);
  });

  it('fait remonter une conversation active entre toutes les pages déjà chargées', () => {
    const cache = {
      pageParams: [0, 1],
      pages: [
        {
          items: [{ id: 'first', lastMessage: { createdAt: '2026-08-30T18:00:00+02:00' } }],
          nextPage: 1,
        },
        {
          items: [{ id: 'active', lastMessage: { createdAt: '2026-08-31T18:00:00+02:00' } }],
          nextPage: null,
        },
      ],
    };
    const sorted = sortConversationActivityCache(cache);
    expect(sorted.pages[0]?.items[0]?.id).toBe('active');
    expect(sorted.pages[1]?.items[0]?.id).toBe('first');
    expect(sorted.pageParams).toBe(cache.pageParams);
  });
});

describe('réactions de messages', () => {
  it('agrège les réactions actives dans le même ordre que Swift', () => {
    expect(
      aggregateMessageReactions(
        [
          { emoji: '❤️', profileId: 'other', removedAt: null },
          { emoji: '👍', profileId: 'me', removedAt: null },
          { emoji: '👍', profileId: 'other', removedAt: null },
          { emoji: '😂', profileId: 'me', removedAt: '2026-08-31T18:00:00+02:00' },
        ],
        'me',
      ),
    ).toEqual([
      { count: 2, emoji: '👍', isMine: true },
      { count: 1, emoji: '❤️', isMine: false },
    ]);
  });

  it('remplace ou retire optimistiquement l’unique réaction personnelle', () => {
    const current = [
      { count: 2, emoji: '👍' as const, isMine: true },
      { count: 1, emoji: '❤️' as const, isMine: false },
    ];
    expect(optimisticMessageReactions(current, '❤️')).toEqual([
      { count: 1, emoji: '👍', isMine: false },
      { count: 2, emoji: '❤️', isMine: true },
    ]);
    expect(optimisticMessageReactions(current, null)).toEqual([
      { count: 1, emoji: '👍', isMine: false },
      { count: 1, emoji: '❤️', isMine: false },
    ]);
  });
});

describe('limites des pièces jointes', () => {
  it('conserve les métadonnées valides et refuse plus de 20 Mo', () => {
    expect(
      createPendingMessageAttachment({
        byteCount: 1024,
        contentType: 'application/pdf',
        fileName: 'setlist.pdf',
        uri: 'file:///setlist.pdf',
      }),
    ).toMatchObject({
      byteCount: 1024,
      contentType: 'application/pdf',
      fileExtension: 'pdf',
      fileName: 'setlist.pdf',
    });
    expect(() =>
      createPendingMessageAttachment({
        byteCount: MESSAGE_ATTACHMENT_MAX_BYTES + 1,
        fileName: 'trop-lourd.mov',
        uri: 'file:///trop-lourd.mov',
      }),
    ).toThrow('message_attachment_too_large');
  });
});
