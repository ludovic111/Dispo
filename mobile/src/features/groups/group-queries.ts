import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchGroupEventResources,
  inviteAvailableToGroupEvent,
  reorderGroupEventSetlist,
  type InviteAvailableToEventInput,
} from './group-event-repository';
import {
  mergeGroupMessagesNewestFirst,
  optimisticGroupReactions,
  type GroupAttendanceStatus,
  type GroupDocument,
  type GroupEventDraft,
  type GroupMessage,
  type GroupMemberKind,
  type GroupReactionEmoji,
  type GroupSong,
  type MusicGroup,
} from './group-model';
import {
  acceptGroupInvitation,
  addSongComment,
  cancelGroupEvent,
  cancelGroupInvitation,
  copyGroupSongToDestinations,
  createGroup,
  createGroupEvents,
  declineGroupInvitation,
  deleteGroupPhoto,
  deleteGroup,
  deleteGroupDocument,
  deleteGroupMessage,
  deleteSongComment,
  editGroupMessage,
  fetchGroupInvitations,
  fetchGroupMessageReactions,
  fetchGroupMessagesPage,
  fetchGroupProfileCandidates,
  fetchGroups,
  groupMessageFromRealtimeRow,
  inviteGroupMember,
  removeGroupMember,
  reorderGroupRepertoire,
  saveEventSetlist,
  saveGroupRepertoire,
  sendGroupMessage,
  setGroupEventAttendance,
  setGroupMessageReaction,
  subscribeToGroupMessages,
  subscribeToGroupMessageSummaries,
  subscribeToGroups,
  transferGroupLeadership,
  updateGroupMember,
  updateGroupEvent,
  updateGroupSettings,
  uploadGroupPhoto,
  uploadGroupDocument,
  type CreateGroupInput,
  type UpdateGroupSettingsInput,
  type UpdateGroupEventInput,
  type UploadGroupDocumentInput,
  type UploadGroupPhotoInput,
} from './group-repository';
import {
  loadAndSeedGroupSeen,
  markGroupSeen,
  totalGroupUnread,
  unreadGroupMessageCount,
  type GroupSeenMap,
} from './group-seen-store';
import {
  applyOptimisticSongCopies,
  removeOptimisticSongCopies,
  type GroupSongCopyTarget,
} from './group-song-copy';

import type { Page } from '@/domain/pagination';
import { useAuth } from '@/features/auth/auth-context';
import type { PendingMessageAttachment } from '@/features/messages/message-model';

export const groupKeys = {
  all: ['groups'] as const,
  candidates: (userId: string) => ['groups', 'candidates', userId] as const,
  eventResources: (userId: string, eventId: string, context: string) =>
    ['groups', 'event-resources', userId, eventId, context] as const,
  invitations: (userId: string) => ['groups', 'invitations', userId] as const,
  list: (userId: string) => ['groups', 'list', userId] as const,
  messages: (userId: string, groupId: string) => ['groups', 'messages', userId, groupId] as const,
  seen: (userId: string) => ['groups', 'seen', userId] as const,
};

export type GroupMessageCache = InfiniteData<Page<GroupMessage>>;
type GroupMessageQueryKey = ReturnType<typeof groupKeys.messages>;
type GroupMessageMutationContext = {
  previousGroups: MusicGroup[] | undefined;
  previousThread: GroupMessageCache | undefined;
  queryKey: GroupMessageQueryKey;
};
type GroupReactionMutationContext = {
  previous: GroupMessageCache | undefined;
  queryKey: GroupMessageQueryKey;
};
type EditGroupMessageInput = { groupId: string; messageId: string; text: string };
type DeleteGroupMessageInput = { groupId: string; messageId: string };
type GroupReactionMutationInput = {
  emoji: GroupReactionEmoji;
  groupId: string;
  message: GroupMessage;
};

function updateCachedGroupMessage(
  data: GroupMessageCache | undefined,
  messageId: string,
  transform: (message: GroupMessage) => GroupMessage,
): GroupMessageCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((message) => (message.id === messageId ? transform(message) : message)),
    })),
  };
}

export function patchGroupMessageCache(
  data: GroupMessageCache | undefined,
  incoming: GroupMessage,
  insert = false,
): GroupMessageCache | undefined {
  if (!data) return data;
  const current = data.pages
    .flatMap((page) => page.items)
    .find((message) => message.id === incoming.id);
  const resolved = current
    ? (mergeGroupMessagesNewestFirst([current], incoming)[0] ?? incoming)
    : incoming;
  const seen = new Set<string>();
  const pages = data.pages.map((page) => {
    const patched = page.items.flatMap((message) => {
      if (seen.has(message.id)) return [];
      seen.add(message.id);
      if (message.id !== incoming.id) return [message];
      return insert ? [] : [resolved];
    });
    return { ...page, items: patched };
  });
  if (insert && pages[0]) pages[0] = { ...pages[0], items: [resolved, ...pages[0].items] };
  return { ...data, pages };
}

export function patchGroupListMessage(
  groups: readonly MusicGroup[] | undefined,
  incoming: GroupMessage,
): MusicGroup[] | undefined {
  if (!groups) return groups;
  return groups.map((group) =>
    group.id === incoming.groupId
      ? {
          ...group,
          messages: mergeGroupMessagesNewestFirst(group.messages, incoming).slice(0, 60),
        }
      : group,
  );
}

function updateGroupListMessage(
  groups: readonly MusicGroup[] | undefined,
  groupId: string,
  messageId: string,
  transform: (message: GroupMessage) => GroupMessage,
): MusicGroup[] | undefined {
  if (!groups) return groups;
  return groups.map((group) =>
    group.id === groupId
      ? {
          ...group,
          messages: group.messages.map((message) =>
            message.id === messageId ? transform(message) : message,
          ),
        }
      : group,
  );
}

function senderForGroup(
  groups: readonly MusicGroup[] | undefined,
  groupId: string,
  senderId: string,
) {
  const member = groups
    ?.find((group) => group.id === groupId)
    ?.members.find((candidate) => candidate.id === senderId);
  return member ? { name: member.name, photoUrl: member.photoUrl } : undefined;
}

export function useGroupEventResources(input: {
  enabled: boolean;
  eventDate: string;
  eventId: string;
  excludedProfileIds: readonly string[];
  includeLeaderData: boolean;
}) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const context = `${input.eventDate}:${input.includeLeaderData ? 'leader' : 'member'}:${[
    ...input.excludedProfileIds,
  ]
    .sort()
    .join(',')}`;
  return useQuery({
    enabled: Boolean(userId && input.eventId && input.enabled),
    queryFn: ({ signal }) =>
      fetchGroupEventResources({
        eventDate: input.eventDate,
        eventId: input.eventId,
        excludedProfileIds: input.excludedProfileIds,
        includeLeaderData: input.includeLeaderData,
        signal,
        userId,
      }),
    queryKey: groupKeys.eventResources(userId, input.eventId, context),
  });
}

export function useInviteAvailableToGroupEvent() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: InviteAvailableToEventInput) => inviteAvailableToGroupEvent(input),
    onSuccess: refresh,
  });
}

export function useReorderGroupEventSetlist() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { eventId: string; songIds: string[] }) =>
      reorderGroupEventSetlist(input.eventId, input.songIds),
    onSuccess: refresh,
  });
}

export function useGroups() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchGroups(userId, signal),
    queryKey: groupKeys.list(userId),
  });
  const groupIdSignature = (query.data ?? [])
    .map((group) => group.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!userId) return;
    return subscribeToGroups(userId, () => {
      void queryClient.invalidateQueries({ exact: true, queryKey: groupKeys.list(userId) });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: groupKeys.invitations(userId),
      });
      void queryClient.invalidateQueries({ queryKey: ['groups', 'event-resources'] });
    });
  }, [queryClient, userId]);
  useEffect(() => {
    if (!userId || !groupIdSignature) return;
    return subscribeToGroupMessageSummaries(groupIdSignature.split(','), userId, (row) => {
      queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (current) => {
        const sender = senderForGroup(current, row.group_id, row.sender_id);
        return patchGroupListMessage(current, groupMessageFromRealtimeRow(row, userId, sender));
      });
    });
  }, [groupIdSignature, queryClient, userId]);
  return query;
}

export function useGroupUnreadState(groups: readonly MusicGroup[]) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const groupSignature = groups
    .map((group) => group.id)
    .sort()
    .join(',');
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: () =>
      loadAndSeedGroupSeen(
        userId,
        groups.map((group) => group.id),
      ),
    queryKey: groupKeys.seen(userId),
  });
  useEffect(() => {
    if (!userId || !groupSignature) return;
    void loadAndSeedGroupSeen(
      userId,
      groups.map((group) => group.id),
    ).then((seen) => {
      queryClient.setQueryData(groupKeys.seen(userId), seen);
    });
  }, [groupSignature, groups, queryClient, userId]);
  const seen = query.data ?? {};
  return {
    ...query,
    countFor: (groupId: string) => {
      const group = groups.find((item) => item.id === groupId);
      return group ? unreadGroupMessageCount(group, userId, seen) : 0;
    },
    total: totalGroupUnread(groups, userId, seen),
  };
}

export function useMarkGroupSeen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useCallback(
    (groupId: string) => {
      const at = new Date().toISOString();
      queryClient.setQueryData<GroupSeenMap>(groupKeys.seen(userId), (current) => ({
        ...(current ?? {}),
        [groupId]: at,
      }));
      void markGroupSeen(userId, groupId, new Date(at)).catch(() => {
        void queryClient.invalidateQueries({ queryKey: groupKeys.seen(userId) });
      });
    },
    [queryClient, userId],
  );
}

export function useGroup(groupId: string) {
  const query = useGroups();
  return { ...query, data: query.data?.find((group) => group.id === groupId) };
}

export function useGroupMessages(groupId: string, active = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const channel = useRef<ReturnType<typeof subscribeToGroupMessages> | null>(null);
  const typingExpiries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingPingAt = useRef(0);
  const [typingMembers, setTypingMembers] = useState<Set<string>>(new Set());
  const queryKey = useMemo(() => groupKeys.messages(userId, groupId), [groupId, userId]);
  const query = useInfiniteQuery<
    Page<GroupMessage>,
    Error,
    InfiniteData<Page<GroupMessage>>,
    GroupMessageQueryKey,
    number
  >({
    enabled: Boolean(userId && groupId && active),
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchGroupMessagesPage(groupId, userId, pageParam, 40, signal),
    queryKey,
    refetchOnMount: 'always',
  });
  const loadedMessageIds = useMemo(
    () => [
      ...new Set(
        (query.data?.pages ?? []).flatMap((page) => page.items.map((message) => message.id)),
      ),
    ],
    [query.data],
  );
  const messageIdSignature = loadedMessageIds.slice().sort().join(',');

  useEffect(() => {
    if (!userId || !groupId || !active) return;
    let cancelled = false;
    const markVisibleMessageSeen = (senderId: string) => {
      if (senderId === userId) return;
      const at = new Date().toISOString();
      queryClient.setQueryData<GroupSeenMap>(groupKeys.seen(userId), (current) => ({
        ...(current ?? {}),
        [groupId]: at,
      }));
      void markGroupSeen(userId, groupId, new Date(at)).catch(() => undefined);
    };
    channel.current = subscribeToGroupMessages(
      groupId,
      userId,
      messageIdSignature ? messageIdSignature.split(',') : [],
      (row, event) => {
        const groups = queryClient.getQueryData<MusicGroup[]>(groupKeys.list(userId));
        const incoming = groupMessageFromRealtimeRow(
          row,
          userId,
          senderForGroup(groups, groupId, row.sender_id),
        );
        const current = queryClient.getQueryData<GroupMessageCache>(queryKey);
        if (current?.pages.length) {
          queryClient.setQueryData<GroupMessageCache>(queryKey, (cache) =>
            patchGroupMessageCache(cache, incoming, event === 'insert'),
          );
        } else {
          // A first Realtime event can race the initial page. Recover the
          // snapshot, then apply that exact delta before acknowledging it.
          void queryClient
            .invalidateQueries({ exact: true, queryKey, refetchType: 'active' })
            .then(() => {
              if (cancelled) return;
              let recovered = false;
              queryClient.setQueryData<GroupMessageCache>(queryKey, (cache) => {
                if (!cache?.pages.length) return cache;
                recovered = true;
                return patchGroupMessageCache(cache, incoming, event === 'insert');
              });
              if (recovered && event === 'insert') markVisibleMessageSeen(row.sender_id);
            })
            .catch(() => undefined);
        }
        queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (cache) =>
          patchGroupListMessage(cache, incoming),
        );
        if (current?.pages.length && event === 'insert') markVisibleMessageSeen(row.sender_id);
      },
      (messageId) => {
        const current = queryClient.getQueryData<GroupMessageCache>(queryKey);
        const isLoaded = current?.pages.some((page) =>
          page.items.some((message) => message.id === messageId),
        );
        if (!isLoaded) return;
        void fetchGroupMessageReactions(messageId, userId)
          .then((reactions) => {
            queryClient.setQueryData<GroupMessageCache>(queryKey, (cache) =>
              updateCachedGroupMessage(cache, messageId, (message) => ({
                ...message,
                reactions,
              })),
            );
          })
          .catch(() => undefined);
      },
      (profileId) => {
        setTypingMembers((current) => new Set(current).add(profileId));
        const previous = typingExpiries.current.get(profileId);
        if (previous) clearTimeout(previous);
        typingExpiries.current.set(
          profileId,
          setTimeout(() => {
            typingExpiries.current.delete(profileId);
            setTypingMembers((current) => {
              const next = new Set(current);
              next.delete(profileId);
              return next;
            });
          }, 4000),
        );
      },
    );
    return () => {
      cancelled = true;
      channel.current?.unsubscribe();
      channel.current = null;
    };
  }, [active, groupId, messageIdSignature, queryClient, queryKey, userId]);

  useEffect(
    () => () => {
      for (const expiry of typingExpiries.current.values()) clearTimeout(expiry);
      typingExpiries.current.clear();
    },
    [],
  );

  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingPingAt.current <= 2000) return;
    lastTypingPingAt.current = now;
    channel.current?.sendTyping();
  }, []);

  return { ...query, pingTyping, someoneIsTyping: typingMembers.size > 0 };
}

export function useGroupInvitations() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchGroupInvitations(signal),
    queryKey: groupKeys.invitations(userId),
  });
}

export function useGroupProfileCandidates() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchGroupProfileCandidates(signal),
    queryKey: groupKeys.candidates(userId),
  });
}

function useRefreshGroups() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ exact: true, queryKey: groupKeys.list(userId) }),
      queryClient.invalidateQueries({ exact: true, queryKey: groupKeys.invitations(userId) }),
      queryClient.invalidateQueries({ queryKey: ['groups', 'event-resources'] }),
    ]);
}

export function useInvitationResponse() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { accept: boolean; invitationId: string }) =>
      input.accept
        ? acceptGroupInvitation(input.invitationId)
        : declineGroupInvitation(input.invitationId),
    onSuccess: refresh,
  });
}

export function useCreateGroup() {
  const { session } = useAuth();
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => createGroup(session?.user.id ?? '', input),
    onSuccess: refresh,
  });
}

export function useInviteGroupMember() {
  const { session } = useAuth();
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { groupId: string; kind: GroupMemberKind; profileId: string }) =>
      inviteGroupMember(input.groupId, session?.user.id ?? '', input.profileId, input.kind),
    onSuccess: refresh,
  });
}

export function useCancelGroupInvitation() {
  const refresh = useRefreshGroups();
  return useMutation({ mutationFn: cancelGroupInvitation, onSuccess: refresh });
}

export function useUpdateGroupMember() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: {
      groupId: string;
      kind?: GroupMemberKind;
      profileId: string;
      role?: string | null;
    }) => updateGroupMember(input.groupId, input.profileId, input),
    onSuccess: refresh,
  });
}

export function useRemoveGroupMember() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { groupId: string; profileId: string }) =>
      removeGroupMember(input.groupId, input.profileId),
    onSuccess: refresh,
  });
}

export function useTransferGroupLeadership() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { groupId: string; profileId: string }) =>
      transferGroupLeadership(input.groupId, input.profileId),
    onSuccess: refresh,
  });
}

export function useUpdateGroupSettings() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: UpdateGroupSettingsInput) => updateGroupSettings(input),
    onSuccess: refresh,
  });
}

export function useGroupPhoto() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (
      input: UploadGroupPhotoInput | { groupId: string; leaderId: string; remove: true },
    ) =>
      'remove' in input ? deleteGroupPhoto(input.groupId, input.leaderId) : uploadGroupPhoto(input),
    onSuccess: refresh,
  });
}

export function useDeleteGroup() {
  const refresh = useRefreshGroups();
  return useMutation({ mutationFn: deleteGroup, onSuccess: refresh });
}

export function useSendGroupMessage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      attachment: PendingMessageAttachment | null;
      groupId: string;
      text: string;
    }) => sendGroupMessage(input.groupId, userId, input.text, input.attachment),
    onSuccess: (message, input) => {
      const groups = queryClient.getQueryData<MusicGroup[]>(groupKeys.list(userId));
      const enriched = groupMessageFromRealtimeRow(
        {
          attachment_name: message.attachmentName,
          attachment_path: message.attachmentPath,
          attachment_size: message.attachmentSize,
          attachment_type: message.attachmentType,
          created_at: message.createdAt,
          deleted_at: message.deletedAt,
          edited_at: message.editedAt,
          group_id: message.groupId,
          id: message.id,
          sender_id: message.senderId,
          text: message.text,
        },
        userId,
        senderForGroup(groups, input.groupId, userId),
      );
      queryClient.setQueryData<GroupMessageCache>(
        groupKeys.messages(userId, input.groupId),
        (current) => patchGroupMessageCache(current, enriched, true),
      );
      queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (current) =>
        patchGroupListMessage(current, enriched),
      );
    },
  });
}

export function useEditGroupMessage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation<void, Error, EditGroupMessageInput, GroupMessageMutationContext>({
    mutationFn: (input) => editGroupMessage(input.messageId, input.text),
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(context.queryKey, context.previousThread);
      queryClient.setQueryData(groupKeys.list(userId), context.previousGroups);
    },
    onMutate: async (input) => {
      const queryKey = groupKeys.messages(userId, input.groupId);
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previousThread = queryClient.getQueryData<GroupMessageCache>(queryKey);
      const previousGroups = queryClient.getQueryData<MusicGroup[]>(groupKeys.list(userId));
      const transform = (message: GroupMessage): GroupMessage => ({
        ...message,
        editedAt: new Date().toISOString(),
        text: input.text.trim(),
      });
      queryClient.setQueryData<GroupMessageCache>(queryKey, (current) =>
        updateCachedGroupMessage(current, input.messageId, transform),
      );
      queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (current) =>
        updateGroupListMessage(current, input.groupId, input.messageId, transform),
      );
      return { previousGroups, previousThread, queryKey };
    },
  });
}

export function useDeleteGroupMessage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteGroupMessageInput, GroupMessageMutationContext>({
    mutationFn: (input) => deleteGroupMessage(input.messageId),
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(context.queryKey, context.previousThread);
      queryClient.setQueryData(groupKeys.list(userId), context.previousGroups);
    },
    onMutate: async (input) => {
      const queryKey = groupKeys.messages(userId, input.groupId);
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previousThread = queryClient.getQueryData<GroupMessageCache>(queryKey);
      const previousGroups = queryClient.getQueryData<MusicGroup[]>(groupKeys.list(userId));
      const transform = (message: GroupMessage): GroupMessage => ({
        ...message,
        attachmentName: null,
        attachmentPath: null,
        attachmentSize: null,
        attachmentType: null,
        deletedAt: new Date().toISOString(),
        reactions: [],
        text: '',
      });
      queryClient.setQueryData<GroupMessageCache>(queryKey, (current) =>
        updateCachedGroupMessage(current, input.messageId, transform),
      );
      queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (current) =>
        updateGroupListMessage(current, input.groupId, input.messageId, transform),
      );
      return { previousGroups, previousThread, queryKey };
    },
  });
}

export function useGroupMessageReaction() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation<void, Error, GroupReactionMutationInput, GroupReactionMutationContext>({
    mutationFn: (input) => {
      const removing = input.message.reactions.some(
        (reaction) => reaction.emoji === input.emoji && reaction.reactedByMe,
      );
      return setGroupMessageReaction(input.message.id, removing ? null : input.emoji);
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onMutate: async (input) => {
      const queryKey = groupKeys.messages(userId, input.groupId);
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previous = queryClient.getQueryData<GroupMessageCache>(queryKey);
      const removing = input.message.reactions.some(
        (reaction) => reaction.emoji === input.emoji && reaction.reactedByMe,
      );
      queryClient.setQueryData<GroupMessageCache>(queryKey, (current) =>
        updateCachedGroupMessage(current, input.message.id, (message) => ({
          ...message,
          reactions: optimisticGroupReactions(message.reactions, removing ? null : input.emoji),
        })),
      );
      return { previous, queryKey };
    },
    onSuccess: (_result, input) => {
      void fetchGroupMessageReactions(input.message.id, userId)
        .then((reactions) => {
          queryClient.setQueryData<GroupMessageCache>(
            groupKeys.messages(userId, input.groupId),
            (current) =>
              updateCachedGroupMessage(current, input.message.id, (message) => ({
                ...message,
                reactions,
              })),
          );
        })
        .catch(() => undefined);
    },
  });
}

export function useSetGroupAttendance() {
  const { session } = useAuth();
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { eventId: string; status: Exclude<GroupAttendanceStatus, 'pending'> }) =>
      setGroupEventAttendance(input.eventId, session?.user.id ?? '', input.status),
    onSuccess: refresh,
  });
}

export function useCreateGroupEvents() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { draft: GroupEventDraft; groupId: string }) =>
      createGroupEvents(input.groupId, input.draft),
    onSuccess: refresh,
  });
}

export function useUpdateGroupEvent() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: UpdateGroupEventInput) => updateGroupEvent(input),
    onSuccess: refresh,
  });
}

export function useCancelGroupEvent() {
  const refresh = useRefreshGroups();
  return useMutation({ mutationFn: cancelGroupEvent, onSuccess: refresh });
}

export function useSaveGroupRepertoire() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { desired: GroupSong[]; groupId: string; original: GroupSong[] }) =>
      saveGroupRepertoire(input.groupId, input.original, input.desired),
    onSuccess: refresh,
  });
}

export function useReorderGroupRepertoire() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { groupId: string; songIds: string[] }) =>
      reorderGroupRepertoire(input.groupId, input.songIds),
    onSuccess: refresh,
  });
}

export function useSaveEventSetlist() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { desired: GroupSong[]; eventId: string; original: GroupSong[] }) =>
      saveEventSetlist(input.eventId, input.original, input.desired),
    onSuccess: refresh,
  });
}

export function useCopyGroupSong() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targets: GroupSongCopyTarget[]) => copyGroupSongToDestinations(targets),
    onError: (_error, targets) => {
      queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (current) =>
        current ? removeOptimisticSongCopies(current, targets) : current,
      );
    },
    onMutate: async (targets) => {
      await queryClient.cancelQueries({ queryKey: groupKeys.list(userId) });
      queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (current) =>
        current ? applyOptimisticSongCopies(current, targets) : current,
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ exact: true, queryKey: groupKeys.list(userId) }),
    onSuccess: (results, targets) => {
      const failedIds = new Set(
        results
          .filter((result) => result.status !== 'copied')
          .map((result) => result.destinationId),
      );
      const failedTargets = targets.filter((target) => failedIds.has(target.destinationId));
      if (!failedTargets.length) return;
      queryClient.setQueryData<MusicGroup[]>(groupKeys.list(userId), (current) =>
        current ? removeOptimisticSongCopies(current, failedTargets) : current,
      );
    },
  });
}

export function useSongComment() {
  const { session } = useAuth();
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: { groupId: string; songId: string; text: string }) =>
      addSongComment(input.groupId, input.songId, session?.user.id ?? '', input.text),
    onSuccess: refresh,
  });
}

export function useDeleteSongComment() {
  const refresh = useRefreshGroups();
  return useMutation({ mutationFn: deleteSongComment, onSuccess: refresh });
}

export function useUploadGroupDocument() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (input: UploadGroupDocumentInput) => uploadGroupDocument(input),
    onSuccess: refresh,
  });
}

export function useDeleteGroupDocument() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (document: GroupDocument) => deleteGroupDocument(document),
    onSuccess: refresh,
  });
}
