import { describe, expect, it } from '@jest/globals';

import { groupSongFromJson } from '@/features/groups/group-model';
import {
  personalSongStyle,
  visiblePersonalSongs,
  type PersonalSong,
} from '@/features/repertoire/repertoire-model';
const make = (id: string, title: string, mastery: number, style: string): PersonalSong => ({
  id,
  song: groupSongFromJson({
    id,
    title,
    artist: 'Duke Ellington',
    genre: 'Jazz',
    is_approved: true,
  })!,
  mastery,
  style,
  origin: 'group',
});
describe('personal repertoire filtering', () => {
  const items = [
    make('a', 'Échos', 1, 'Jazz swing'),
    make('b', 'Blue Bossa', 3, 'Jazz latin'),
    make('c', 'Autumn Leaves', 0, ''),
  ];
  it('searches title and artist independently of accents/case', () => {
    expect(visiblePersonalSongs(items, 'echos', '', 'title').map((s) => s.id)).toEqual(['a']);
    expect(
      visiblePersonalSongs(items, 'ELLINGTON', 'Jazz latin', 'title').map((s) => s.id),
    ).toEqual(['b']);
  });
  it('uses personal style before imported metadata and orders mastery without mutating data', () => {
    expect(personalSongStyle(items[0]!)).toBe('Jazz swing');
    expect(personalSongStyle(items[2]!)).toBe('Jazz');
    expect(visiblePersonalSongs(items, '', '', 'mastery').map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(items.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
