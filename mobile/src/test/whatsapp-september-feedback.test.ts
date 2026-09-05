import { describe, expect, it, jest } from '@jest/globals';

import { matchProfilesToGig, type GigMatchProfile } from '@/features/gigs/gig-model';
import { eventHasUnseenChange } from '@/features/groups/group-event-changes';
import { groupSongFromJson, groupSongToJson } from '@/features/groups/group-model';
import { copiedGroupSong } from '@/features/groups/group-song-copy';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'copy' }));

describe('retours WhatsApp du 5 septembre', () => {
  it('submits a pending suggestion without the leader-only solo field', () => {
    const song = groupSongFromJson({
      id: 'a',
      title: 'Suggestion',
      is_approved: false,
      suggested_by: 'member',
    })!;
    expect(groupSongToJson(song)).not.toHaveProperty('solos');
    expect(groupSongToJson({ ...song, isApproved: true }).solos).toEqual([]);
  });
  it('persists a set break through serialization but not when copying a song', () => {
    const song = groupSongFromJson({
      id: 'a',
      title: 'Afro blue',
      starts_set: true,
      is_approved: true,
      suggested_by: 'leader',
    })!;
    expect(song.startsSet).toBe(true);
    expect(groupSongToJson(song).starts_set).toBe(true);
    expect(groupSongToJson({ ...song, startsSet: false })).not.toHaveProperty('starts_set');
    expect(copiedGroupSong(song, { approved: false, suggestedBy: 'member' }).startsSet).toBe(false);
  });
  it('only flags a change newer than the revision the member actually opened', () => {
    const first = '2026-09-05T10:00:00Z';
    const second = '2026-09-05T11:00:00Z';
    expect(eventHasUnseenChange(null, null)).toBe(false);
    expect(eventHasUnseenChange(first, null)).toBe(true);
    expect(eventHasUnseenChange(first, first)).toBe(false);
    expect(eventHasUnseenChange(second, first)).toBe(true);
    expect(eventHasUnseenChange(first, second)).toBe(false);
  });
  it('matches any selected school and excludes musicians outside those schools', () => {
    const profiles: GigMatchProfile[] = ['a', 'b', 'c'].map((id) => ({
      id,
      name: id,
      schoolIds: [id],
      instruments: ['Piano'],
      genres: ['Jazz'],
      availableDates: ['2026-09-10'],
      level: 'Avancé',
      photoUrl: null,
      relationRank: 0,
    }));
    const gig = {
      date: '2026-09-10T18:00:00Z',
      genre: 'Jazz',
      hostId: 'host',
      wantedInstruments: ['Piano'],
    };
    const now = new Date('2026-09-05');
    expect(
      matchProfilesToGig({ ...gig, wantedSchoolIds: ['a', 'b'] }, profiles, now).map(
        (profile) => profile.id,
      ),
    ).toEqual(['a', 'b']);
    expect(matchProfilesToGig({ ...gig, wantedSchoolIds: [] }, profiles, now)).toHaveLength(3);
  });
});
