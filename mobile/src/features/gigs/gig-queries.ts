import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { applyToGig, createGig, fetchGig, fetchGigsPage } from './gig-repository';

import type { CreateGigInput } from '@/domain/gig';
import { useAuth } from '@/features/auth/auth-context';

export const gigKeys = {
  all: ['gigs'] as const,
  detail: (userId: string, id: string) => ['gigs', 'detail', userId, id] as const,
  feed: (userId: string) => ['gigs', 'feed', userId] as const,
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
    queryFn: ({ signal }) => fetchGig(gigId, signal),
    enabled: Boolean(userId && gigId),
  });
}

export function useCreateGig() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGigInput) => createGig(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gigKeys.feed(userId) }),
  });
}

export function useApplyToGig() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      gigId: string;
      instrument: string;
      message: string;
      musicianId: string;
    }) => applyToGig(input.gigId, input.musicianId, input.instrument, input.message),
    onSuccess: (_data, input) =>
      queryClient.invalidateQueries({ queryKey: gigKeys.detail(userId, input.gigId) }),
  });
}
