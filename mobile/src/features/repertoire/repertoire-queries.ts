import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback } from 'react';

import {
  fetchPersonalRepertoire,
  setPersonalRepertoireVisibility,
  updatePersonalSong,
} from './repertoire-repository';

import { useAuth } from '@/features/auth/auth-context';

export function usePersonalRepertoire(profileId: string) {
  const { session } = useAuth();
  const viewerId = session?.user.id ?? '';
  const focused = useIsFocused();
  const client = useQueryClient();
  const query = useQuery({
    enabled: Boolean(profileId && viewerId && focused),
    queryKey: ['personal-repertoire', viewerId, profileId],
    queryFn: ({ signal }) => fetchPersonalRepertoire(profileId, signal),
    staleTime: 0,
    refetchInterval: 15_000,
  });
  useFocusEffect(
    useCallback(() => {
      if (profileId && viewerId)
        void client.invalidateQueries({ queryKey: ['personal-repertoire', viewerId, profileId] });
    }, [client, profileId, viewerId]),
  );
  return query;
}
export function usePersonalRepertoireActions() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['personal-repertoire', userId] });
  const visibility = useMutation({
    mutationFn: (isPublic: boolean) => setPersonalRepertoireVisibility(userId, isPublic),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (input: { id: string; mastery?: number; style?: string; hidden?: boolean }) => {
      const { id, ...changes } = input;
      return updatePersonalSong(userId, id, changes);
    },
    onSuccess: refresh,
  });
  return { visibility, update };
}
