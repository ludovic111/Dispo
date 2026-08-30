import { describe, expect, it } from '@jest/globals';
import type { InfiniteData } from '@tanstack/react-query';

import { newMessagePayload, patchRealtimeMessage, type ChatMessage } from '@/domain/message';
import { makePage, pageRange, type Page } from '@/domain/pagination';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    conversationId: 'conversation-1',
    createdAt: '2026-08-30T12:00:00.000Z',
    deletedAt: null,
    editedAt: null,
    id: 'message-1',
    readAt: null,
    senderId: 'user-1',
    text: 'Bonjour',
    ...overrides,
  };
}

describe('pagination', () => {
  it('calcule des plages inclusives sans chevauchement', () => {
    expect(pageRange(0, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(3, 20)).toEqual({ from: 60, to: 79 });
  });

  it('propose une page suivante uniquement lorsqu’une page est pleine', () => {
    expect(makePage(['a', 'b'], 2, 2)).toEqual({ items: ['a', 'b'], nextPage: 3 });
    expect(makePage(['a'], 2, 2)).toEqual({ items: ['a'], nextPage: null });
  });

  it('refuse les paramètres susceptibles de casser les limites serveur', () => {
    expect(() => pageRange(-1, 20)).toThrow('page must be a non-negative integer');
    expect(() => pageRange(0.5, 20)).toThrow('page must be a non-negative integer');
    expect(() => pageRange(0, 0)).toThrow('pageSize must be between 1 and 100');
    expect(() => pageRange(0, 101)).toThrow('pageSize must be between 1 and 100');
  });
});

describe('envoi de message', () => {
  it('normalise le texte sans changer les identifiants', () => {
    expect(newMessagePayload('conversation-1', 'user-1', '  On répète à 18 h ?  ')).toEqual({
      conversation_id: 'conversation-1',
      sender_id: 'user-1',
      text: 'On répète à 18 h ?',
    });
  });

  it('refuse un message vide ou supérieur à 4 000 caractères', () => {
    expect(() => newMessagePayload('conversation-1', 'user-1', '   ')).toThrow('message_invalid');
    expect(() => newMessagePayload('conversation-1', 'user-1', 'a'.repeat(4001))).toThrow(
      'message_invalid',
    );
  });
});

describe('patch Realtime sans rechargement global', () => {
  it('remplace le message connu dans le cache paginé sans le dupliquer', () => {
    const originalMessage = message();
    const cache: InfiniteData<Page<ChatMessage>, number> = {
      pageParams: [0, 1],
      pages: [
        { items: [originalMessage], nextPage: 1 },
        { items: [message({ id: 'message-older' })], nextPage: null },
      ],
    };
    const incoming = message({ editedAt: '2026-08-30T12:05:00.000Z', text: 'Bonsoir' });

    const patched = patchRealtimeMessage(cache, incoming);

    expect(patched).not.toBe(cache);
    expect(patched?.pageParams).toBe(cache.pageParams);
    expect(
      patched?.pages.flatMap((page) => page.items).filter((item) => item.id === incoming.id),
    ).toEqual([incoming]);
    expect(cache.pages[0]?.items[0]).toBe(originalMessage);
  });

  it('insère un nouveau message en tête de la première page sans perdre la pagination', () => {
    const cache: InfiniteData<Page<ChatMessage>, number> = {
      pageParams: [0],
      pages: [{ items: [message()], nextPage: null }],
    };
    const incoming = message({ id: 'message-new', text: 'Nouveau' });

    const patched = patchRealtimeMessage(cache, incoming);

    expect(patched?.pages[0]?.items.map((item) => item.id)).toEqual(['message-new', 'message-1']);
    expect(patched?.pageParams).toEqual([0]);
    expect(patchRealtimeMessage(undefined, incoming)).toBeUndefined();
  });
});
