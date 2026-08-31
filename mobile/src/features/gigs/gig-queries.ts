import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  applyToGig,
  createGig,
  decideGigApplication,
  deleteGig,
  fetchGig,
  fetchGigFormDefaults,
  fetchGigMatches,
  fetchGigsPage,
  respondToDirectGig,
  withdrawGigApplication,
} from './gig-repository';

import { useAuth } from '@/features/auth/auth-context';
import type { GigCreateInput } from '@/features/gigs/gig-model';

export const gigKeys = {
  all: ['gigs'] as const,
  defaults: (userId: string) => ['gigs', 'defaults', userId] as const,
  detail: (userId: string, id: string) => ['gigs', 'detail', userId, id] as const,
  feed: (userId: string) => ['gigs', 'feed', userId] as const,
  matches: (userId: string, id: string) => ['gigs', 'matches', userId, id] as const,
};

export function useGigs() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useInfiniteQuery({
    queryKey: gigKeys.feed(userId),
    queryFn: ({ pageParam, signal }) => fetchGigsPage(pageParam, 20, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId),
  });
}

export function useGig(gigId: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: gigKeys.detail(userId, gigId),
    queryFn: ({ signal }) => fetchGig(gigId, userId, signal),
    enabled: Boolean(userId && gigId),
  });
}

export function useGigFormDefaults() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: gigKeys.defaults(userId),
    queryFn: ({ signal }) => fetchGigFormDefaults(userId, signal),
    enabled: Boolean(userId),
  });
}

export function useGigMatches(gigId: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useInfiniteQuery({
    queryKey: gigKeys.matches(userId, gigId),
    queryFn: ({ pageParam, signal }) => fetchGigMatches(gigId, userId, pageParam, 50, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId && gigId),
  });
}

function useInvalidateGig() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return async (gigId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: gigKeys.feed(userId) }),
      queryClient.invalidateQueries({ queryKey: ['sessions'] }),
      ...(gigId
        ? [
            queryClient.invalidateQueries({ queryKey: gigKeys.detail(userId, gigId) }),
            queryClient.invalidateQueries({ queryKey: gigKeys.matches(userId, gigId) }),
          ]
        : []),
    ]);
  };
}

export function useCreateGig() {
  const invalidate = useInvalidateGig();
  return useMutation({
    mutationFn: (input: GigCreateInput) => createGig(input),
    onSuccess: (gigId) => invalidate(gigId),
  });
}

export function useApplyToGig() {
  const invalidate = useInvalidateGig();
  return useMutation({
    mutationFn: (input: {
      gigId: string;
      instrument: string;
      message: string;
      musicianId: string;
    }) => applyToGig(input.gigId, input.musicianId, input.instrument, input.message),
    onSuccess: (_data, input) => invalidate(input.gigId),
  });
}

export function useWithdrawGigApplication() {
  const invalidate = useInvalidateGig();
  return useMutation({
    mutationFn: (input: { gigId: string; musicianId: string }) =>
      withdrawGigApplication(input.gigId, input.musicianId),
    onSuccess: (_data, input) => invalidate(input.gigId),
  });
}

export function useGigApplicationDecision() {
  const invalidate = useInvalidateGig();
  return useMutation({
    mutationFn: (input: {
      applicationId: string;
      decision: 'accept' | 'decline' | 'reopen';
      gigId: string;
    }) => decideGigApplication(input.applicationId, input.decision),
    onSuccess: (_data, input) => invalidate(input.gigId),
  });
}

export function useRespondToDirectGig() {
  const invalidate = useInvalidateGig();
  return useMutation({
    mutationFn: (input: { accept: boolean; gigId: string }) =>
      respondToDirectGig(input.gigId, input.accept),
    onSuccess: (_data, input) => invalidate(input.gigId),
  });
}

export function useDeleteGig() {
  const invalidate = useInvalidateGig();
  return useMutation({
    mutationFn: (gigId: string) => deleteGig(gigId),
    onSuccess: (_data, gigId) => invalidate(gigId),
  });
}
