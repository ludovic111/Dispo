import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

const key = (userId: string, eventId: string) => `dispo.event.seen.v1:${userId}:${eventId}`;
const queryKey = (userId: string, eventId: string) => ['event-seen', userId, eventId] as const;

export function eventHasUnseenChange(changedAt?: string | null, seenAt?: string | null) {
  return Boolean(changedAt && Date.parse(changedAt) > (Date.parse(seenAt ?? '') || 0));
}

export function useEventHasUnseenChange(
  userId: string,
  eventId: string,
  changedAt?: string | null,
) {
  const seen = useQuery({
    queryKey: queryKey(userId, eventId),
    queryFn: () => AsyncStorage.getItem(key(userId, eventId)),
    enabled: Boolean(userId && changedAt),
    staleTime: Infinity,
  });
  return seen.isSuccess && eventHasUnseenChange(changedAt, seen.data);
}

export function useMarkEventChangeSeen(userId: string, eventId: string, changedAt?: string | null) {
  const client = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      if (!userId || !changedAt) return;
      // Record the revision actually displayed, not the device clock.
      void AsyncStorage.setItem(key(userId, eventId), changedAt)
        .then(() => client.setQueryData(queryKey(userId, eventId), changedAt))
        .catch(() => undefined);
    }, [changedAt, client, eventId, userId]),
  );
}
