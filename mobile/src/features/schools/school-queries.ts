import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NormalizedSchoolAffiliationInput } from './school-model';
import {
  fetchMySchoolAffiliations,
  fetchSchool,
  fetchSchoolMembersPage,
  fetchSchoolsPage,
  leaveSchool,
  saveSchoolAffiliation,
} from './school-repository';

import { useAuth } from '@/features/auth/auth-context';

export const schoolKeys = {
  all: ['schools'] as const,
  detail: (userId: string, schoolId: string) => ['schools', 'detail', userId, schoolId] as const,
  directory: (userId: string) => ['schools', 'directory', userId] as const,
  members: (userId: string, schoolId: string) => ['schools', 'members', userId, schoolId] as const,
  mine: (userId: string) => ['schools', 'mine', userId] as const,
};

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
