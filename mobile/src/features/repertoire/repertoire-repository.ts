import type { PersonalSong } from './repertoire-model';

import { groupSongFromJson, groupSongToJson, type GroupSong } from '@/features/groups/group-model';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Json } from '@/services/supabase/database.types';

export async function fetchPersonalRepertoire(
  profileId: string,
  signal?: AbortSignal,
): Promise<{ isPublic: boolean; songs: PersonalSong[] }> {
  const client = getSupabaseClient();
  const settings = await client
    .from('personal_repertoire_settings')
    .select('is_public')
    .eq('profile_id', profileId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (settings.error) throw settings.error;
  const songs: PersonalSong[] = [];
  for (let offset = 0; ; offset += 200) {
    const result = await client
      .from('personal_repertoire')
      .select('id,song,mastery,style,origin')
      .eq('profile_id', profileId)
      .eq('hidden', false)
      .order('id')
      .range(offset, offset + 199)
      .abortSignal(signal ?? new AbortController().signal);
    if (result.error) throw result.error;
    for (const row of result.data) {
      const source =
        typeof row.song === 'object' && row.song !== null && !Array.isArray(row.song)
          ? row.song
          : {};
      const song = groupSongFromJson({ ...source, id: row.id, is_approved: true });
      if (song)
        songs.push({
          id: row.id,
          song,
          mastery: row.mastery,
          style: row.style,
          origin: row.origin === 'manual' ? 'manual' : 'group',
        });
    }
    if (result.data.length < 200) break;
  }
  return { isPublic: settings.data?.is_public ?? false, songs };
}
export async function addPersonalSong(song: GroupSong): Promise<string> {
  const result = await getSupabaseClient().rpc('add_personal_song', {
    p_song: groupSongToJson(song) as Json,
  });
  if (result.error) throw result.error;
  return result.data;
}
export async function updatePersonalSong(
  profileId: string,
  id: string,
  changes: { mastery?: number; style?: string; hidden?: boolean },
): Promise<void> {
  const result = await getSupabaseClient()
    .from('personal_repertoire')
    .update(changes)
    .eq('id', id)
    .eq('profile_id', profileId)
    .select('id')
    .single();
  if (result.error) throw result.error;
}
export async function setPersonalRepertoireVisibility(
  profileId: string,
  isPublic: boolean,
): Promise<void> {
  const result = await getSupabaseClient()
    .from('personal_repertoire_settings')
    .upsert({ profile_id: profileId, is_public: isPublic });
  if (result.error) throw result.error;
}
