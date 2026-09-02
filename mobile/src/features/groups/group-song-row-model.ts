import type { GroupMember, GroupSong } from './group-model';

export function soloOrderMembers(
  song: Pick<GroupSong, 'solos'>,
  members: readonly GroupMember[],
): (GroupMember | null)[] {
  return song.solos.map((memberId) => members.find((member) => member.id === memberId) ?? null);
}
