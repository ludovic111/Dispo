import type { GroupMember, GroupSong } from './group-model';

/** A passage in the solo order, never a profile or a group member. */
export const TRADING_FOURS_SOLO_ID = '4-4';

export function songSoloOrder(song: Pick<GroupSong, 'solos' | 'soloMode'>): string[] {
  // Display build 60's legacy mode as one unassigned passage. Keep its original
  // snapshot intact so the existing three-way server merge can remove the mode.
  if (song.soloMode === 'trading_fours' && !song.solos.includes(TRADING_FOURS_SOLO_ID)) {
    return [...song.solos, TRADING_FOURS_SOLO_ID];
  }
  return song.solos;
}

export function withSoloOrder(song: GroupSong, solos: string[]): GroupSong {
  return { ...song, solos: [...new Set(solos)], soloMode: 'successive' };
}

export function soloOrderMembers(
  song: Pick<GroupSong, 'solos' | 'soloMode'>,
  members: readonly GroupMember[],
): (GroupMember | null)[] {
  return songSoloOrder(song).map(
    (memberId) => members.find((member) => member.id === memberId) ?? null,
  );
}
