import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { messageTabBadgeCount } from './tab-badge-model';

import { useAuth } from '@/features/auth/auth-context';
import {
  countUnopenedMatchedGigs,
  readOpenedGigIds,
  subscribeToOpenedGigs,
} from '@/features/gigs/gig-opened-store';
import { gigKeys } from '@/features/gigs/gig-queries';
import { fetchMyGigMatches } from '@/features/gigs/gig-repository';
import {
  useGroupInvitations,
  useGroups,
  useGroupUnreadState,
} from '@/features/groups/group-queries';
import { useSessions } from '@/features/sessions/session-queries';
import { getSupabaseClient } from '@/services/supabase/client';
import { uniqueRealtimeTopic } from '@/services/supabase/realtime-topic';

const tabBadgeKeys = {
  directMessages: (userId: string) => ['tab-badges', 'direct-messages', userId] as const,
  openedGigs: (userId: string) => ['tab-badges', 'opened-gigs', userId] as const,
};

async function fetchDirectUnreadCount(userId: string, signal?: AbortSignal): Promise<number> {
  const query = getSupabaseClient()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .neq('sender_id', userId)
    .is('read_at', null)
    .is('deleted_at', null);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export interface TabBadgeCounts {
  messages: number;
  sessions: number;
  sos: number;
}

export function useTabBadgeCounts(): TabBadgeCounts {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const sessions = useSessions();
  const groups = useGroups();
  const invitations = useGroupInvitations();
  const groupUnread = useGroupUnreadState(groups.data ?? []);
  const directMessages = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchDirectUnreadCount(userId, signal),
    queryKey: tabBadgeKeys.directMessages(userId),
  });
  // Même requête que le fil « SOS » : le score serveur décide de la compatibilité.
  const gigs = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchMyGigMatches(100, signal),
    queryKey: gigKeys.myMatches(userId),
  });
  const openedGigs = useQuery({
    enabled: Boolean(userId),
    queryFn: () => readOpenedGigIds(userId),
    queryKey: tabBadgeKeys.openedGigs(userId),
  });

  useEffect(
    () =>
      subscribeToOpenedGigs((openedUserId, gigId) => {
        if (openedUserId !== userId) return;
        queryClient.setQueryData<Set<string>>(tabBadgeKeys.openedGigs(userId), (current) => {
          const next = new Set(current ?? []);
          next.add(gigId);
          return next;
        });
      }),
    [queryClient, userId],
  );

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(uniqueRealtimeTopic(`tab-badges:${userId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => void queryClient.invalidateQueries({ queryKey: tabBadgeKeys.directMessages(userId) }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gig_requests' },
        () => void queryClient.invalidateQueries({ queryKey: gigKeys.myMatches(userId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return {
    messages: messageTabBadgeCount(
      directMessages.data ?? 0,
      groupUnread.total,
      invitations.data?.length ?? 0,
    ),
    sessions: sessions.data?.pendingResponses.length ?? 0,
    sos:
      gigs.data && openedGigs.data
        ? countUnopenedMatchedGigs(gigs.data, userId, openedGigs.data)
        : 0,
  };
}
