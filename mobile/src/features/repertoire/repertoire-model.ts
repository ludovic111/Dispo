import { normalizeSongText } from '@/domain/song';
import type { GroupSong } from '@/features/groups/group-model';

export const masteryLabels = ['À découvrir', 'En apprentissage', 'À l’aise', 'Maîtrisé'] as const;
export const repertoireStyles = [
  'Jazz latin',
  'Jazz swing',
  'Bebop',
  'Bossa nova',
  'Blues',
  'Funk',
  'Soul',
  'Pop',
  'Rock',
  'Classique',
  'Autre',
] as const;
export type RepertoireOrder = 'title' | 'style' | 'mastery';
export interface PersonalSong {
  id: string;
  song: GroupSong;
  mastery: number;
  style: string;
  origin: 'manual' | 'group';
}
export function personalSongStyle(item: PersonalSong): string {
  return item.style || item.song.genre || item.song.genres[0] || '';
}
export function visiblePersonalSongs(
  items: readonly PersonalSong[],
  search: string,
  style: string,
  order: RepertoireOrder,
): PersonalSong[] {
  const needle = normalizeSongText(search);
  return items
    .filter(
      (item) =>
        (!style || personalSongStyle(item) === style) &&
        normalizeSongText(`${item.song.title} ${item.song.artist}`).includes(needle),
    )
    .sort(
      (a, b) =>
        (order === 'mastery'
          ? b.mastery - a.mastery
          : order === 'style'
            ? personalSongStyle(a).localeCompare(personalSongStyle(b))
            : 0) ||
        a.song.title.localeCompare(b.song.title) ||
        a.song.artist.localeCompare(b.song.artist) ||
        a.id.localeCompare(b.id),
    );
}

/** Only send edited fields, preserving concurrent imports and unrelated edits. */
export function personalArrangementChanges(original: GroupSong, desired: GroupSong) {
  const result: Record<string, string | number | null> = {};
  const fields = {
    title: 'title',
    artist: 'artist',
    key: 'key',
    tempoBpm: 'tempo_bpm',
    form: 'form',
  } as const;
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const value = desired[key];
    if (value !== original[key]) result[fields[key]] = value;
  }
  return result;
}
