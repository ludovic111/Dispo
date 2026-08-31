import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import type {
  NormalizedSchoolAffiliationInput,
  SchoolCommunity,
  SchoolMessage,
} from './school-model';
import {
  blockSchoolMember,
  deleteSchoolMessage,
  editSchoolMessage,
  fetchMySchoolAffiliations,
  fetchSchool,
  fetchSchoolCommunities,
  fetchSchoolMessagesPage,
  fetchSchoolMembersPage,
  fetchSchoolsPage,
  leaveSchool,
  reportSchoolMessage,
  saveSchoolAffiliation,
  sendSchoolMessage,
  subscribeToSchoolCommunities,
  subscribeToSchoolMessages,
} from './school-repository';
import {
  loadAndSeedSchoolSeen,
  markSchoolSeen,
  type SchoolSeenMap,
  totalSchoolUnread,
  unreadSchoolMessageCount,
} from './school-seen-store';

import type { Page } from '@/domain/pagination';
import { useAuth } from '@/features/auth/auth-context';

export const schoolKeys = {
  all: ['schools'] as const,
  communities: (userId: string) => ['schools', 'communities', userId] as const,
  detail: (userId: string, schoolId: string) => ['schools', 'detail', userId, schoolId] as const,
  directory: (userId: string) => ['schools', 'directory', userId] as const,
  members: (userId: string, schoolId: string) => ['schools', 'members', userId, schoolId] as const,
  messages: (userId: string, channelId: string) =>
    ['schools', 'messages', userId, channelId] as const,
  mine: (userId: string) => ['schools', 'mine', userId] as const,
  seen: (userId: string) => ['schools', 'seen', userId] as const,
};

type SchoolMessageCache = InfiniteData<Page<SchoolMessage>>;

function patchSchoolMessageCache(
  current: SchoolMessageCache | undefined,
  message: SchoolMessage,
): SchoolMessageCache | undefined {
  if (!current?.pages.length) return current;
  let found = false;
  const pages = current.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (item.id !== message.id) return item;
      found = true;
      return message;
    }),
  }));
  if (!found && pages[0]) pages[0] = { ...pages[0], items: [message, ...pages[0].items] };
  return { ...current, pages };
}

function updateSchoolMessageCache(
  current: SchoolMessageCache | undefined,
  messageId: string,
  transform: (message: SchoolMessage) => SchoolMessage,
): SchoolMessageCache | undefined {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((message) => (message.id === messageId ? transform(message) : message)),
    })),
  };
}

export function useSchoolDirectory() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useInfiniteQuery({
    enabled: Boolean(userId),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchSchoolsPage(pageParam, 20, signal),
    getNextPageParam: (page) => page.nextPage ?? undefined,
    queryKey: schoolKeys.directory(userId),
  });
}

export function useMySchoolAffiliations() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchMySchoolAffiliations(signal),
    queryKey: schoolKeys.mine(userId),
  });
}

export function useSchoolCommunities() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchSchoolCommunities(signal),
    queryKey: schoolKeys.communities(userId),
  });
}

/** Owns school membership and summary streams once for the authenticated account. */
export function useSchoolRealtimeSync(communities: readonly SchoolCommunity[] | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const channelSignature = (communities ?? [])
    .map((community) => community.channelId)
    .sort()
    .join(',');
  const schoolSignature = (communities ?? [])
    .map((community) => community.affiliation.school.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!userId) return;
    return subscribeToSchoolCommunities(
      channelSignature ? channelSignature.split(',') : [],
      schoolSignature ? schoolSignature.split(',') : [],
      userId,
      () => {
        void queryClient.invalidateQueries({
          exact: true,
          queryKey: schoolKeys.communities(userId),
        });
        void queryClient.invalidateQueries({ queryKey: ['schools', 'messages', userId] });
      },
      () => {
        void queryClient.invalidateQueries({ queryKey: schoolKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      },
    );
  }, [channelSignature, queryClient, schoolSignature, userId]);
}

export function useSchoolUnreadState(communities: readonly SchoolCommunity[]) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const schoolIds = communities.map((community) => community.affiliation.school.id);
  const schoolSignature = [...schoolIds].sort().join(',');
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: () => loadAndSeedSchoolSeen(userId, schoolIds),
    queryKey: schoolKeys.seen(userId),
  });
  useEffect(() => {
    if (!userId || !schoolSignature) return;
    void loadAndSeedSchoolSeen(userId, schoolSignature.split(',')).then((seen) => {
      queryClient.setQueryData(schoolKeys.seen(userId), seen);
    });
  }, [queryClient, schoolSignature, userId]);
  const seen = query.data ?? {};
  return {
    ...query,
    countFor: (schoolId: string) => {
      const community = communities.find((item) => item.affiliation.school.id === schoolId);
      return community ? unreadSchoolMessageCount(community, userId, seen) : 0;
    },
    total: totalSchoolUnread(communities, userId, seen),
  };
}

export function useMarkSchoolSeen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useCallback(
    (schoolId: string) => {
      if (!userId || !schoolId) return;
      const at = new Date().toISOString();
      queryClient.setQueryData<SchoolSeenMap>(schoolKeys.seen(userId), (current) => ({
        ...(current ?? {}),
        [schoolId]: at,
      }));
      void markSchoolSeen(userId, schoolId, new Date(at)).catch(() => {
        void queryClient.invalidateQueries({ queryKey: schoolKeys.seen(userId) });
      });
    },
    [queryClient, userId],
  );
}

export function useSchoolCommunity(schoolId: string) {
  const query = useSchoolCommunities();
  return {
    ...query,
    data: query.data?.find((community) => community.affiliation.school.id === schoolId),
  };
}

export function useSchoolMessages(channelId: string, schoolId: string, active = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => schoolKeys.messages(userId, channelId), [channelId, userId]);
  const query = useInfiniteQuery<
    Page<SchoolMessage>,
    Error,
    InfiniteData<Page<SchoolMessage>>,
    ReturnType<typeof schoolKeys.messages>,
    number
  >({
    enabled: Boolean(userId && channelId && active),
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchSchoolMessagesPage(channelId, pageParam, 40, signal),
    queryKey,
    refetchOnMount: 'always',
  });
  useEffect(() => {
    if (!userId || !channelId || !active) return;
    return subscribeToSchoolMessages(channelId, (row, event) => {
      if (event === 'insert' && row.sender_id !== userId) {
        const at = new Date().toISOString();
        queryClient.setQueryData<SchoolSeenMap>(schoolKeys.seen(userId), (current) => ({
          ...(current ?? {}),
          [schoolId]: at,
        }));
        void markSchoolSeen(userId, schoolId, new Date(at)).catch(() => undefined);
      }
      void queryClient.invalidateQueries({ exact: true, queryKey });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: schoolKeys.communities(userId),
      });
    });
  }, [active, channelId, queryClient, queryKey, schoolId, userId]);
  return query;
}

export function useSchool(schoolId: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId && schoolId),
    queryFn: ({ signal }) => fetchSchool(schoolId, signal),
    queryKey: schoolKeys.detail(userId, schoolId),
  });
}

export function useSchoolMembers(schoolId: string, enabled: boolean) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useInfiniteQuery({
    enabled: Boolean(userId && schoolId && enabled),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchSchoolMembersPage(schoolId, pageParam, 30, signal),
    getNextPageParam: (page) => page.nextPage ?? undefined,
    queryKey: schoolKeys.members(userId, schoolId),
  });
}

function useInvalidateSchools() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: schoolKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['profiles'] }),
    ]);
  };
}

export function useSaveSchoolAffiliation() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (input: NormalizedSchoolAffiliationInput) => saveSchoolAffiliation(input),
    onSuccess: invalidate,
  });
}

export function useLeaveSchool() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: leaveSchool,
    onSuccess: invalidate,
  });
}

export function useSendSchoolMessage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const metadata = session?.user.user_metadata;
  const senderName = typeof metadata?.name === 'string' ? metadata.name : null;
  const senderPhotoUrl = typeof metadata?.avatar_url === 'string' ? metadata.avatar_url : null;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string; text: string }) =>
      sendSchoolMessage(input.channelId, input.text, {
        id: userId,
        name: senderName,
        photoUrl: senderPhotoUrl,
      }),
    onSuccess: (message) => {
      queryClient.setQueryData<SchoolMessageCache>(
        schoolKeys.messages(userId, message.channelId),
        (current) => patchSchoolMessageCache(current, message),
      );
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: schoolKeys.messages(userId, message.channelId),
      });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: schoolKeys.communities(userId),
      });
    },
  });
}

interface SchoolMessageMutationInput {
  channelId: string;
  messageId: string;
  text?: string;
}

interface SchoolMessageMutationContext {
  previous: SchoolMessageCache | undefined;
  queryKey: ReturnType<typeof schoolKeys.messages>;
}

export function useEditSchoolMessage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation<void, Error, SchoolMessageMutationInput, SchoolMessageMutationContext>({
    mutationFn: (input) => editSchoolMessage(input.messageId, input.text ?? ''),
    onError: (_error, _input, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onMutate: async (input) => {
      const queryKey = schoolKeys.messages(userId, input.channelId);
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previous = queryClient.getQueryData<SchoolMessageCache>(queryKey);
      queryClient.setQueryData<SchoolMessageCache>(queryKey, (current) =>
        updateSchoolMessageCache(current, input.messageId, (message) => ({
          ...message,
          editedAt: new Date().toISOString(),
          text: input.text?.trim() ?? message.text,
        })),
      );
      return { previous, queryKey };
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: schoolKeys.messages(userId, input.channelId),
      });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: schoolKeys.communities(userId),
      });
    },
  });
}

export function useDeleteSchoolMessage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation<void, Error, SchoolMessageMutationInput, SchoolMessageMutationContext>({
    mutationFn: (input) => deleteSchoolMessage(input.messageId),
    onError: (_error, _input, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onMutate: async (input) => {
      const queryKey = schoolKeys.messages(userId, input.channelId);
      await queryClient.cancelQueries({ exact: true, queryKey });
      const previous = queryClient.getQueryData<SchoolMessageCache>(queryKey);
      queryClient.setQueryData<SchoolMessageCache>(queryKey, (current) =>
        updateSchoolMessageCache(current, input.messageId, (message) => ({
          ...message,
          deletedAt: new Date().toISOString(),
          text: '',
        })),
      );
      return { previous, queryKey };
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: schoolKeys.messages(userId, input.channelId),
      });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: schoolKeys.communities(userId),
      });
    },
  });
}

export function useReportSchoolMessage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useMutation({
    mutationFn: (message: Pick<SchoolMessage, 'id' | 'senderId'>) =>
      reportSchoolMessage(userId, message),
  });
}

export function useBlockSchoolMember() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => blockSchoolMember(userId, profileId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: schoolKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
      ]);
    },
  });
}
