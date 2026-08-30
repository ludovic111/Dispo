import type { InfiniteData } from '@tanstack/react-query';

import type { Page } from './pagination';

export interface ChatMessage {
  conversationId: string;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  readAt: string | null;
  senderId: string;
  text: string;
}

export function patchRealtimeMessage(
  data: InfiniteData<Page<ChatMessage>> | undefined,
  incoming: ChatMessage,
): InfiniteData<Page<ChatMessage>> | undefined {
  if (!data) return data;
  let found = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((message) => {
      if (message.id !== incoming.id) return message;
      found = true;
      return incoming;
    }),
  }));
  if (!found && pages[0]) pages[0] = { ...pages[0], items: [incoming, ...pages[0].items] };
  return { ...data, pages };
}

export function newMessagePayload(conversationId: string, senderId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 4000) throw new Error('message_invalid');
  return { conversation_id: conversationId, sender_id: senderId, text: trimmed };
}
