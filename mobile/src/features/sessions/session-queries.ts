import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AttendanceStatus, SessionsData } from './session-model';
import { fetchSessions, respondToDirectSession, setSessionAttendance } from './session-repository';

import { useAuth } from '@/features/auth/auth-context';

export const sessionKeys = {
  all: ['sessions'] as const,
  agenda: (userId: string) => ['sessions', 'agenda', userId] as const,
};

export function useSessions() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchSessions(userId, signal),
    queryKey: sessionKeys.agenda(userId),
  });
}

export function useSetSessionAttendance() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const queryKey = sessionKeys.agenda(userId);
  return useMutation({
    mutationFn: (input: { eventId: string; status: Exclude<AttendanceStatus, 'pending'> }) =>
      setSessionAttendance(input.eventId, userId, input.status),
    onError: (_error, _input, previous: SessionsData | undefined) => {
      if (previous) queryClient.setQueryData(queryKey, previous);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<SessionsData>(queryKey);
      queryClient.setQueryData<SessionsData>(queryKey, (current) =>
        current
          ? {
              ...current,
              pendingResponses: current.pendingResponses.filter(
                (response) => response.kind !== 'group' || response.eventId !== input.eventId,
              ),
              upcoming: current.upcoming.map((item) =>
                item.eventId === input.eventId ? { ...item, attendanceStatus: input.status } : item,
              ),
            }
          : current,
      );
      return previous ?? { past: [], pendingResponses: [], upcoming: [] };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

export function useRespondToDirectSession() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const queryKey = sessionKeys.agenda(userId);
  return useMutation({
    mutationFn: (input: { accept: boolean; gigId: string }) =>
      respondToDirectSession(input.gigId, input.accept),
    onError: (_error, _input, previous: SessionsData | undefined) => {
      if (previous) queryClient.setQueryData(queryKey, previous);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<SessionsData>(queryKey);
      queryClient.setQueryData<SessionsData>(queryKey, (current) =>
        current
          ? {
              ...current,
              pendingResponses: current.pendingResponses.filter(
                (response) => response.kind !== 'direct' || response.gigId !== input.gigId,
              ),
            }
          : current,
      );
      return previous ?? { past: [], pendingResponses: [], upcoming: [] };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
