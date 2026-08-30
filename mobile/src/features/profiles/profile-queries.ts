import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { fetchProfile, fetchProfilesPage } from './profile-repository';

export const profileKeys = {
  all: ['profiles'] as const,
  detail: (id: string, userId: string) => ['profiles', 'detail', userId, id] as const,
  discovery: (userId: string) => ['profiles', 'discovery', userId] as const,
  me: (userId: string) => ['profiles', 'me', userId] as const,
};

export function useDiscoveryProfiles(userId: string) {
  return useInfiniteQuery({
    queryKey: profileKeys.discovery(userId),
    queryFn: ({ pageParam, signal }) => fetchProfilesPage(userId, pageParam, 20, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(userId),
  });
}

export function useProfile(profileId: string, userId: string) {
  return useQuery({
    queryKey: profileId === userId ? profileKeys.me(userId) : profileKeys.detail(profileId, userId),
    queryFn: ({ signal }) => fetchProfile(profileId, userId, signal),
    enabled: Boolean(profileId && userId),
  });
}
