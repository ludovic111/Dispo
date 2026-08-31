import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  optimisticMessageReactions,
  patchDirectMessageCache,
  sortConversationActivityCache,
  type DirectMessage,
  type MessageReactionEmoji,
  type MessageReactionSummary,
} from './message-model';
import {
  deleteMessage,
  editMessage,
  fetchConversationContact,
  fetchConversationsPage,
  fetchMessageReactions,
  fetchMessagesPage,
  markConversationRead,
  markMessagesDelivered,
  sendMessage,
  setMessageReaction,
  subscribeToConversation,
  subscribeToInbox,
  subscribeToTyping,
  type ConversationSummary,
  type SendMessageInput,
  type TypingChannelController,
} from './message-repository';

import type { Page } from '@/domain/pagination';
import { useAuth } from '@/features/auth/auth-context';

export const messageKeys = {
  contact: (userId: string, conversationId: string) =>
    ['messages', 'contact', userId, conversationId] as const,
  conversations: (userId: string) => ['messages', 'conversations', userId] as const,
  thread: (userId: string, conversationId: string) =>
    ['messages', 'thread', userId, conversationId] as const,
};

type MessageCache = InfiniteData<Page<DirectMessage>>;
type ConversationCache = InfiniteData<Page<ConversationSummary>>;

function patchConversationLastMessage(
  data: ConversationCache | undefined,
  conversationId: string,
  message: DirectMessage,
  userId: string,
): ConversationCache | undefined {
  if (!data) return data;
  const patched = {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const last = conversation.lastMessage;
        if (
          last &&
          last.id !== message.id &&
          new Date(last.createdAt).getTime() > new Date(message.createdAt).getTime()
        )
          return conversation;
        return {
          ...conversation,
          lastMessage: message,
          lastMessageIsMine: message.senderId === userId,
        };
      }),
    })),
  };
  return sortConversationActivityCache(patched);
}

function updateMessage(
  data: MessageCache | undefined,
  messageId: string,
  transform: (message: DirectMessage) => DirectMessage,
): MessageCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((message) => (message.id === messageId ? transform(message) : message)),
    })),
  };
}

function patchMessageReactions(
  data: MessageCache | undefined,
  messageId: string,
  reactions: MessageReactionSummary[],
): MessageCache | undefined {
  return updateMessage(data, messageId, (message) => ({ ...message, reactions }));
}

export function useConversations(userId: string) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: messageKeys.conversations(userId),
    queryFn: ({ pageParam, signal }) => fetchConversationsPage(userId, pageParam, 20, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId),
    select: sortConversationActivityCache,
  });
  useEffect(() => {
    if (!userId) return;
    return subscribeToInbox(userId, (message) => {
      queryClient.setQueryData<ConversationCache>(messageKeys.conversations(userId), (current) =>
        patchConversationLastMessage(current, message.conversationId, message, userId),
      );
      if (message.senderId !== userId) {
        void markMessagesDelivered().catch(() => undefined);
        void queryClient.invalidateQueries({
          exact: true,
          queryKey: messageKeys.conversations(userId),
          refetchType: 'active',
        });
      }
    });
  }, [queryClient, userId]);
  useEffect(() => {
    if (!userId || !query.data) return;
    void markMessagesDelivered().catch(() => undefined);
  }, [query.data, userId]);
  return query;
}

export function useConversationContact(conversationId: string, userId: string) {
  return useQuery({
    queryKey: messageKeys.contact(userId, conversationId),
    queryFn: ({ signal }) => fetchConversationContact(conversationId, userId, signal),
    enabled: Boolean(conversationId && userId),
  });
}

export function useMessages(conversationId: string, active = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const realtimeRecoveryPending = useRef(false);
  const previousActive = useRef(active);
  const query = useInfiniteQuery({
    queryKey: messageKeys.thread(userId, conversationId),
    queryFn: ({ pageParam, signal }) =>
      fetchMessagesPage(conversationId, userId, pageParam, 40, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId && conversationId && active),
  });

  useEffect(() => {
    const becameActive = active && !previousActive.current;
    previousActive.current = active;
    if (!becameActive || !userId || !conversationId) return;
    // The global stale time is 30 seconds; a short profile detour or app
    // background must still recover messages received while this stream was
    // intentionally stopped.
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: messageKeys.thread(userId, conversationId),
      refetchType: 'active',
    });
  }, [active, conversationId, queryClient, userId]);

  useEffect(() => {
    if (!userId || !conversationId || !active) return;
    let cancelled = false;
    const queryKey = messageKeys.thread(userId, conversationId);
    const stop = subscribeToConversation(
      conversationId,
      (message, event) => {
        const threadCache = queryClient.getQueryData<MessageCache>(queryKey);
        if (event === 'insert' && !threadCache) {
          // A Realtime INSERT can beat the initial paginated request. Recover
          // from the server before acknowledging it as read so it never
          // disappears from the visible thread.
          if (!realtimeRecoveryPending.current) {
            realtimeRecoveryPending.current = true;
            void queryClient
              .invalidateQueries({ exact: true, queryKey, refetchType: 'active' })
              .then(() => {
                realtimeRecoveryPending.current = false;
                if (cancelled) return;
                const recovered = queryClient.getQueryData<MessageCache>(queryKey);
                const isVisible = recovered?.pages.some((page) =>
                  page.items.some((item) => item.id === message.id),
                );
                if (!isVisible) return;
                return markMessagesDelivered()
                  .then(() => markConversationRead(conversationId))
                  .then(() =>
                    queryClient.invalidateQueries({
                      exact: true,
                      queryKey: messageKeys.conversations(userId),
                      refetchType: 'active',
                    }),
                  );
              })
              .catch(() => {
                realtimeRecoveryPending.current = false;
              });
          }
          queryClient.setQueryData<ConversationCache>(
            messageKeys.conversations(userId),
            (current) => patchConversationLastMessage(current, conversationId, message, userId),
          );
          return;
        }
        queryClient.setQueryData<MessageCache>(queryKey, (current) =>
          patchDirectMessageCache(current, message, event === 'insert'),
        );
        queryClient.setQueryData<ConversationCache>(messageKeys.conversations(userId), (current) =>
          patchConversationLastMessage(current, conversationId, message, userId),
        );
        if (message.senderId !== userId && !message.readAt) {
          void markMessagesDelivered().catch(() => undefined);
          void markConversationRead(conversationId)
            .then(() =>
              queryClient.invalidateQueries({
                exact: true,
                queryKey: messageKeys.conversations(userId),
                refetchType: 'active',
              }),
            )
            .catch(() => undefined);
        }
      },
      (messageId) => {
        void fetchMessageReactions(messageId, userId)
          .then((reactions) => {
            queryClient.setQueryData<MessageCache>(
              messageKeys.thread(userId, conversationId),
              (current) => patchMessageReactions(current, messageId, reactions),
            );
          })
          .catch(() => undefined);
      },
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, conversationId, queryClient, userId]);

  useEffect(() => {
    if (!userId || !conversationId || !active || !query.data || realtimeRecoveryPending.current)
      return;
    void markMessagesDelivered().catch(() => undefined);
    void markConversationRead(conversationId)
      .then(() =>
        queryClient.invalidateQueries({
          exact: true,
          queryKey: messageKeys.conversations(userId),
          refetchType: 'active',
        }),
      )
      .catch(() => undefined);
  }, [active, conversationId, query.data, queryClient, userId]);

  return query;
}

export function useTypingPresence(conversationId: string, userId: string, active = true) {
  const controller = useRef<TypingChannelController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPingAt = useRef(0);
  const [contactIsTyping, setContactIsTyping] = useState(false);

  useEffect(() => {
    if (!conversationId || !userId || !active) return;
    controller.current = subscribeToTyping(conversationId, userId, () => {
      setContactIsTyping(true);
      if (expiry.current) clearTimeout(expiry.current);
      expiry.current = setTimeout(() => setContactIsTyping(false), 4000);
    });
    return () => {
      controller.current?.unsubscribe();
      controller.current = null;
      if (expiry.current) clearTimeout(expiry.current);
      expiry.current = null;
      setContactIsTyping(false);
    };
  }, [active, conversationId, userId]);

  const ping = useCallback(() => {
    const now = Date.now();
    if (now - lastPingAt.current <= 2000) return;
    lastPingAt.current = now;
    controller.current?.send();
  }, []);

  return { contactIsTyping, ping };
}

export function useSendMessage(conversationId: string, senderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => sendMessage(conversationId, senderId, input),
    onSuccess: (message) => {
      queryClient.setQueryData<MessageCache>(
        messageKeys.thread(senderId, conversationId),
        (current) => patchDirectMessageCache(current, message),
      );
      queryClient.setQueryData<ConversationCache>(messageKeys.conversations(senderId), (current) =>
        patchConversationLastMessage(current, conversationId, message, senderId),
      );
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: messageKeys.conversations(senderId),
        refetchType: 'active',
      });
    },
  });
}

export function useEditMessage(conversationId: string, userId: string) {
  const queryClient = useQueryClient();
  const queryKey = messageKeys.thread(userId, conversationId);
  return useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      editMessage(messageId, text),
    onMutate: async ({ messageId, text }) => {
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previous = queryClient.getQueryData<MessageCache>(queryKey);
      queryClient.setQueryData<MessageCache>(queryKey, (current) =>
        updateMessage(current, messageId, (message) => ({
          ...message,
          editedAt: new Date().toISOString(),
          text: text.trim(),
        })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ exact: true, queryKey }),
  });
}

export function useDeleteMessage(conversationId: string, userId: string) {
  const queryClient = useQueryClient();
  const queryKey = messageKeys.thread(userId, conversationId);
  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previous = queryClient.getQueryData<MessageCache>(queryKey);
      queryClient.setQueryData<MessageCache>(queryKey, (current) =>
        updateMessage(current, messageId, (message) => ({
          ...message,
          attachment: null,
          deletedAt: new Date().toISOString(),
          reactions: [],
          text: '',
        })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ exact: true, queryKey }),
  });
}

export interface ReactionMutationInput {
  emoji: MessageReactionEmoji;
  message: DirectMessage;
}

export function useSetMessageReaction(conversationId: string, userId: string) {
  const queryClient = useQueryClient();
  const queryKey = messageKeys.thread(userId, conversationId);
  return useMutation({
    mutationFn: ({ emoji, message }: ReactionMutationInput) => {
      const removing = message.reactions.some(
        (reaction) => reaction.emoji === emoji && reaction.isMine,
      );
      return setMessageReaction(message.id, removing ? null : emoji);
    },
    onMutate: async ({ emoji, message }) => {
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previous = queryClient.getQueryData<MessageCache>(queryKey);
      const removing = message.reactions.some(
        (reaction) => reaction.emoji === emoji && reaction.isMine,
      );
      queryClient.setQueryData<MessageCache>(queryKey, (current) =>
        patchMessageReactions(
          current,
          message.id,
          optimisticMessageReactions(message.reactions, removing ? null : emoji),
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ exact: true, queryKey }),
  });
}
