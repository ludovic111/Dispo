import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  blockProfile,
  fetchProfileCollaborators,
  fetchProfileFollowersPage,
  fetchProfileSocialState,
  reportProfile,
  setProfileCollaboration,
  setProfileFollowing,
  setProfileRating,
} from './profile-social-repository';

import { useAuth } from '@/features/auth/auth-context';
import { profileKeys } from '@/features/profiles/profile-queries';

export const profileSocialKeys = {
  all: ['profile-social'] as const,
  collaborators: (profileId: string) => ['profile-social', 'collaborators', profileId] as const,
  followers: (profileId: string) => ['profile-social', 'followers', profileId] as const,
  state: (userId: string, profileId: string) =>
    ['profile-social', 'state', userId, profileId] as const,
};

export function useProfileSocialState(profileId: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId && profileId && userId !== profileId),
    queryFn: ({ signal }) => fetchProfileSocialState(profileId, userId, signal),
    queryKey: profileSocialKeys.state(userId, profileId),
  });
}

export function useProfileFollowers(profileId: string) {
  return useInfiniteQuery({
    enabled: Boolean(profileId),
    queryFn: ({ pageParam, signal }) => fetchProfileFollowersPage(profileId, pageParam, 30, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    queryKey: profileSocialKeys.followers(profileId),
  });
}

export function useProfileCollaborators(profileId: string) {
  return useQuery({
    enabled: Boolean(profileId),
    queryFn: ({ signal }) => fetchProfileCollaborators(profileId, signal),
    queryKey: profileSocialKeys.collaborators(profileId),
  });
}

function useInvalidateProfileSocial(profileId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profileKeys.all }),
      queryClient.invalidateQueries({ queryKey: profileSocialKeys.all }),
      queryClient.invalidateQueries({ queryKey: profileSocialKeys.followers(profileId) }),
      queryClient.invalidateQueries({ queryKey: profileSocialKeys.collaborators(profileId) }),
    ]);
  };
}

export function useSetProfileFollowing(profileId: string) {
  const { session } = useAuth();
  const invalidate = useInvalidateProfileSocial(profileId);
  return useMutation({
    mutationFn: (following: boolean) =>
      setProfileFollowing(session?.user.id ?? '', profileId, following),
    onSuccess: invalidate,
  });
}

export function useSetProfileCollaboration(profileId: string) {
  const { session } = useAuth();
  const invalidate = useInvalidateProfileSocial(profileId);
  return useMutation({
    mutationFn: (played: boolean) =>
      setProfileCollaboration(session?.user.id ?? '', profileId, played),
    onSuccess: invalidate,
  });
}

export function useSetProfileRating(profileId: string) {
  const { session } = useAuth();
  const invalidate = useInvalidateProfileSocial(profileId);
  return useMutation({
    mutationFn: (stars: number | null) =>
      setProfileRating(session?.user.id ?? '', profileId, stars),
    onSuccess: invalidate,
  });
}

export function useReportProfile(profileId: string) {
  const { session } = useAuth();
  return useMutation({
    mutationFn: (reason: string) => reportProfile(session?.user.id ?? '', profileId, reason),
  });
}

export function useBlockProfile(profileId: string) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => blockProfile(session?.user.id ?? '', profileId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
        queryClient.invalidateQueries({ queryKey: profileSocialKeys.all }),
      ]);
    },
  });
}
