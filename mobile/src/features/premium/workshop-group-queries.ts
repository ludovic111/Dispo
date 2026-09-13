import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createWorkshopGroup, type WorkshopGroupInput } from './workshop-groups';

import { useAuth } from '@/features/auth/auth-context';
import { groupRefreshFilters } from '@/features/groups/group-queries';

/** Same cache refresh as a regular group creation, plus the subscription counters. */
export function useCreateWorkshopGroup() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkshopGroupInput) => createWorkshopGroup(userId, input),
    onSuccess: () =>
      Promise.all(
        [...groupRefreshFilters(userId), { queryKey: ['subscription', userId] }].map((filter) =>
          queryClient.invalidateQueries(filter),
        ),
      ),
  });
}
