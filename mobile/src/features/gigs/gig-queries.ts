import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  applyToGig,
  contactGigApplicant,
  createGig,
  updateGig,
  decideGigApplication,
  deleteGig,
  fetchGig,
  fetchGigCandidateCount,
  fetchGigCandidates,
  fetchGigForEdit,
  fetchGigFormDefaults,
  fetchGigsPage,
  fetchHostedGigsPage,
  fetchMyGigMatches,
  fetchMyPendingDirectTargets,
  respondToDirectGig,
  withdrawGigApplication,
} from './gig-repository';
import { useSosAcceptanceCelebration, type AcceptedSos } from './sos-acceptance-celebration';

import { useAuth } from '@/features/auth/auth-context';
import type { GigCreateInput } from '@/features/gigs/gig-model';
import { useExhaustivePages } from '@/features/pagination/exhaustive-pages';

export const gigKeys = {
  all: ['gigs'] as const,
  defaults: (userId: string) => ['gigs', 'defaults', userId] as const,
  details: (userId: string) => ['gigs', 'detail', userId] as const,
  detail: (userId: string, id: string) => [...gigKeys.details(userId), id] as const,
  feed: (userId: string) => ['gigs', 'feed', userId] as const,
  hosted: (userId: string) => ['gigs', 'hosted', userId] as const,
  matchesForUser: (userId: string) => ['gigs', 'matches', userId] as const,
  matches: (userId: string, id: string) => [...gigKeys.matchesForUser(userId), id] as const,
  candidateCount: (userId: string, id: string) =>
    [...gigKeys.matchesForUser(userId), id, 'count'] as const,
  myMatches: (userId: string) => ['gigs', 'my-matches', userId] as const,
  pendingDirect: (userId: string) => ['gigs', 'pending-direct', userId] as const,
};

export function useGigs() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useInfiniteQuery({
    queryKey: gigKeys.feed(userId),
    queryFn: ({ pageParam, signal }) => fetchGigsPage(pageParam, 20, signal, userId),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId),
  });
  const exhaustive = useExhaustivePages({
    enabled: Boolean(userId),
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isError: query.isError || query.isFetchNextPageError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    loadKey: gigKeys.feed(userId).join(':'),
  });
  return {
    ...query,
    isExhaustiveError: query.isError || query.isFetchNextPageError,
    isExhaustive: exhaustive.isComplete,
    isExhaustiveLoading: exhaustive.isLoading,
    isLoading: query.isLoading || exhaustive.isLoading,
  };
}

export function useHostedGigs() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useInfiniteQuery({
    queryKey: gigKeys.hosted(userId),
    queryFn: ({ pageParam, signal }) => fetchHostedGigsPage(userId, pageParam, 20, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId),
  });
  const exhaustive = useExhaustivePages({
    enabled: Boolean(userId),
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isError: query.isError || query.isFetchNextPageError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    loadKey: gigKeys.hosted(userId).join(':'),
  });
  return {
    ...query,
    isExhaustiveError: query.isError || query.isFetchNextPageError,
    isExhaustive: exhaustive.isComplete,
    isExhaustiveLoading: exhaustive.isLoading,
    isLoading: query.isLoading || exhaustive.isLoading,
  };
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

export function useGigForEdit(gigId: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: ['gigs', 'edit', userId, gigId],
    queryFn: ({ signal }) => fetchGigForEdit(gigId, userId, signal),
    enabled: Boolean(userId && gigId),
    staleTime: 0,
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

/** Hôte : profils compatibles avec un poste ouvert, triés par score serveur. */
export function useGigCandidates(gigId: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: gigKeys.matches(userId, gigId),
    queryFn: ({ signal }) => fetchGigCandidates(gigId, 50, signal),
    enabled: Boolean(userId && gigId),
  });
}

/** Hôte : compteur léger de profils compatibles (talon vert du ticket), rafraîchi toutes les 60 s. */
export function useGigCandidateCount(gigId: string, enabled: boolean) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: gigKeys.candidateCount(userId, gigId),
    queryFn: ({ signal }) => fetchGigCandidateCount(gigId, signal),
    enabled: Boolean(userId && gigId && enabled),
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 30_000,
  });
}

/** Viewer : annonces du fil où il joue un poste ouvert, avec leur score. */
export function useMyGigMatches() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: gigKeys.myMatches(userId),
    queryFn: ({ signal }) => fetchMyGigMatches(100, signal),
    enabled: Boolean(userId),
  });
}

/** Viewer : personnes à qui une demande directe est encore en attente. */
export function useMyPendingDirectTargets() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: gigKeys.pendingDirect(userId),
    queryFn: ({ signal }) => fetchMyPendingDirectTargets(userId, signal),
    enabled: Boolean(userId),
  });
}

function useInvalidateGig() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return async (gigId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: gigKeys.feed(userId) }),
      queryClient.invalidateQueries({ queryKey: gigKeys.hosted(userId) }),
      queryClient.invalidateQueries({ queryKey: gigKeys.myMatches(userId) }),
      queryClient.invalidateQueries({ queryKey: gigKeys.pendingDirect(userId) }),
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

export function useUpdateGig() {
  const invalidate = useInvalidateGig();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { gigId: string; values: GigCreateInput; clearExactAddress?: boolean }) =>
      updateGig(input.gigId, input.values, input.clearExactAddress),
    onSuccess: async (_data, input) => {
      await Promise.all([
        invalidate(input.gigId),
        client.invalidateQueries({ queryKey: ['groups'] }),
        client.invalidateQueries({ queryKey: ['gigs', 'edit'] }),
      ]);
    },
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
  const celebrate = useSosAcceptanceCelebration();
  return useMutation({
    mutationFn: (input: {
      accept: boolean;
      gigId: string;
      celebration?: AcceptedSos;
      onCelebrationComplete?: () => void;
    }) => respondToDirectGig(input.gigId, input.accept),
    onSuccess: (_data, input) => {
      if (input.accept && input.celebration)
        celebrate({
          ...input.celebration,
          ...(input.onCelebrationComplete ? { onComplete: input.onCelebrationComplete } : {}),
        });
      return invalidate(input.gigId);
    },
  });
}

export function useDeleteGig() {
  const invalidate = useInvalidateGig();
  return useMutation({
    mutationFn: (gigId: string) => deleteGig(gigId),
    onSuccess: (_data, gigId) => invalidate(gigId),
  });
}

/** Contact unique d'un candidat : renvoie l'identifiant de la conversation ouverte. */
export function useContactGigApplicant() {
  const invalidate = useInvalidateGig();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { applicationId: string; gigId: string; text: string }) =>
      contactGigApplicant(input.applicationId, input.text),
    onSuccess: async (_conversationId, input) => {
      await Promise.all([
        invalidate(input.gigId),
        client.invalidateQueries({ queryKey: ['messages'] }),
        client.invalidateQueries({ queryKey: ['tab-badges'] }),
      ]);
    },
  });
}
