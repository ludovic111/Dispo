import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  fetchConversationsPage,
  fetchMessagesPage,
  sendMessage,
  subscribeToConversation,
  type ConversationSummary,
} from './message-repository';

import { patchRealtimeMessage } from '@/domain/message';
import type { ChatMessage } from '@/domain/message';
import type { Page } from '@/domain/pagination';
import { useAuth } from '@/features/auth/auth-context';

export const messageKeys = {
  conversations: (userId: string) => ['messages', 'conversations', userId] as const,
  thread: (userId: string, conversationId: string) =>
    ['messages', 'thread', userId, conversationId] as const,
};

type MessageCache = InfiniteData<Page<ChatMessage>>;
type ConversationCache = InfiniteData<Page<ConversationSummary>>;

function patchConversationLastMessage(
  data: ConversationCache | undefined,
  conversationId: string,
  message: ChatMessage,
): ConversationCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, lastMessage: message }
          : conversation,
      ),
    })),
  };
}

export function useConversations(userId: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.conversations(userId),
    queryFn: ({ pageParam, signal }) => fetchConversationsPage(userId, pageParam, 20, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId),
  });
}

export function useMessages(conversationId: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: messageKeys.thread(userId, conversationId),
    queryFn: ({ pageParam, signal }) => fetchMessagesPage(conversationId, pageParam, 40, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId && conversationId),
  });

  useEffect(() => {
    if (!userId || !conversationId) return;
    return subscribeToConversation(conversationId, (message) => {
      queryClient.setQueryData<MessageCache>(
        messageKeys.thread(userId, conversationId),
        (current) => patchRealtimeMessage(current, message),
      );
      queryClient.setQueryData<ConversationCache>(messageKeys.conversations(userId), (current) =>
        patchConversationLastMessage(current, conversationId, message),
      );
    });
  }, [conversationId, queryClient, userId]);

  return query;
}

export function useSendMessage(conversationId: string, senderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => sendMessage(conversationId, senderId, text),
    onSuccess: (message) => {
      queryClient.setQueryData<MessageCache>(
        messageKeys.thread(senderId, conversationId),
        (current) => patchRealtimeMessage(current, message),
      );
      queryClient.setQueryData<ConversationCache>(messageKeys.conversations(senderId), (current) =>
        patchConversationLastMessage(current, conversationId, message),
      );
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: messageKeys.conversations(senderId),
        refetchType: 'active',
      });
    },
  });
}
