import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { fetchProfile, fetchProfilesPage } from './profile-repository';

import { useExhaustivePages } from '@/features/pagination/exhaustive-pages';

export const profileKeys = {
  all: ['profiles'] as const,
  detail: (id: string, userId: string) => ['profiles', 'detail', userId, id] as const,
  discovery: (userId: string) => ['profiles', 'discovery', userId] as const,
  me: (userId: string) => ['profiles', 'me', userId] as const,
};

export function useDiscoveryProfiles(userId: string) {
  const query = useInfiniteQuery({
    queryKey: profileKeys.discovery(userId),
    queryFn: ({ pageParam, signal }) => fetchProfilesPage(userId, pageParam, 20, signal),
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
    loadKey: profileKeys.discovery(userId).join(':'),
  });
  return {
    ...query,
    isExhaustiveError: query.isError || query.isFetchNextPageError,
    isExhaustive: exhaustive.isComplete,
    isExhaustiveLoading: exhaustive.isLoading,
    isLoading: query.isLoading || exhaustive.isLoading,
  };
}

export function useProfile(profileId: string, userId: string) {
  return useQuery({
    queryKey: profileId === userId ? profileKeys.me(userId) : profileKeys.detail(profileId, userId),
    queryFn: ({ signal }) => fetchProfile(profileId, userId, signal),
    enabled: Boolean(profileId && userId),
  });
}
