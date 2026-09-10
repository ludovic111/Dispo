import { describe, expect, it } from '@jest/globals';

import { groupSongFromJson, groupSongToJson } from '@/features/groups/group-model';
import { copiedGroupSong } from '@/features/groups/group-song-copy';
import { songSoloOrder, withSoloOrder } from '@/features/groups/group-song-row-model';

const payload = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Blue Bossa',
  is_approved: true,
  solos: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
};

describe('4-4 comme passage sans musicien dans les solos', () => {
  it('sauvegarde 4-4 entre deux musiciens sans changer les participants', () => {
    const song = groupSongFromJson(payload)!;
    const order = [song.solos[0]!, '4-4', song.solos[1]!];
    const saved = groupSongToJson(withSoloOrder(song, order));
    expect(saved.solos).toEqual(order);
    expect(saved).not.toHaveProperty('solo_mode');
    expect(songSoloOrder(groupSongFromJson(saved)!)).toEqual(order);
  });
  it('permet 4-4 seul sans aucun profil et sans doublon', () => {
    const song = groupSongFromJson({ ...payload, solos: [] })!;
    expect(groupSongFromJson(groupSongToJson(withSoloOrder(song, ['4-4', '4-4'])))!.solos).toEqual([
      '4-4',
    ]);
  });
  it('convertit ancien mode en une entrée en préservant le snapshot de fusion', () => {
    const song = groupSongFromJson({ ...payload, solo_mode: 'trading_fours' })!;
    expect(songSoloOrder(song)).toEqual([...payload.solos, '4-4']);
    expect(groupSongToJson(song).solo_mode).toBe('trading_fours');
    expect(groupSongToJson(song).solos).toEqual(payload.solos);
    const converted = withSoloOrder(song, songSoloOrder(song));
    expect(groupSongToJson(converted)).not.toHaveProperty('solo_mode');
    expect(songSoloOrder(groupSongFromJson(groupSongToJson(converted))!)).toEqual([
      ...payload.solos,
      '4-4',
    ]);
  });
  it('retire le passage hérité sans le faire réapparaître à la réouverture', () => {
    const song = groupSongFromJson({ ...payload, solo_mode: 'trading_fours' })!;
    const removed = withSoloOrder(
      song,
      songSoloOrder(song).filter((id) => id !== '4-4'),
    );
    expect(songSoloOrder(groupSongFromJson(groupSongToJson(removed))!)).toEqual(payload.solos);
  });
  it('conserve les anciens solos et ne copie pas les solos entre groupes', () => {
    expect(songSoloOrder(groupSongFromJson(payload)!)).toEqual(payload.solos);
    expect(songSoloOrder(groupSongFromJson({ ...payload, solo_mode: '4/4' })!)).toEqual(
      payload.solos,
    );
    const song = withSoloOrder(groupSongFromJson(payload)!, ['4-4', ...payload.solos]);
    expect(
      songSoloOrder(copiedGroupSong(song, { id: 'copy', approved: true, suggestedBy: 'leader' })),
    ).toEqual([]);
  });
});
