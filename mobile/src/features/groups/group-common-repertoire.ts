import { randomUUID } from 'expo-crypto';

import { getSupabaseClient } from '@/services/supabase/client';
import type { Json } from '@/services/supabase/database.types';

export interface GroupCommonRepertoire {
  songs: Json[];
  unavailableCount: number;
}

export async function fetchGroupCommonRepertoire(
  memberIds: string[],
  signal?: AbortSignal,
): Promise<GroupCommonRepertoire> {
  const query = getSupabaseClient().rpc('group_common_repertoire', {
    p_profiles: [...new Set(memberIds)].sort(),
  });
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const value = result.data;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.songs) ||
    typeof value.unavailable_count !== 'number'
  )
    throw new Error('group_repertoire_invalid');
  return { songs: value.songs, unavailableCount: value.unavailable_count };
}

export async function initialGroupRepertoire(memberIds: string[], userId: string): Promise<Json[]> {
  const result = await fetchGroupCommonRepertoire(memberIds);
  if (result.unavailableCount > 0) throw new Error('group_repertoire_private');
  return result.songs.map((song) => {
    if (!song || typeof song !== 'object' || Array.isArray(song))
      throw new Error('group_repertoire_invalid');
    return { ...song, id: randomUUID().toLowerCase(), is_approved: true, suggested_by: userId };
  });
}
