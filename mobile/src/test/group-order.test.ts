import { describe, expect, it } from '@jest/globals';

import { type GroupEvent, type GroupSong, type MusicGroup } from '@/features/groups/group-model';
import {
  applyOptimisticEventSetlistOrder,
  applyOptimisticGroupRepertoireOrder,
} from '@/features/groups/group-order';

function song(id: string, isApproved = true): GroupSong {
  return {
    albumTitle: null,
    artist: 'Artiste',
    artworkUrl: null,
    canonicalSongId: null,
    catalogId: null,
    chords: null,
    composer: null,
    durationMilliseconds: null,
    form: null,
    genre: null,
    genres: [],
    id,
    irealDisabled: false,
    irealUrl: null,
    isApproved,
    isrc: null,
    key: null,
    metadataSource: null,
    metadataUpdatedAt: null,
    platformIds: {},
    platformLinks: {},
    previewUrl: null,
    releaseYear: null,
    solos: [],
    suggestedBy: 'member',
    tempoBpm: null,
    title: id,
    trackUrl: null,
  };
}

function event(setlist: GroupSong[]): GroupEvent {
  return {
    attendance: [],
    date: '2026-09-01T18:00:00.000Z',
    exactAddress: null,
    groupId: 'group-1',
    id: 'event-1',
    kind: 'Concert',
    privateLocationState: 'absent',
    publicLocationLabel: 'Genève',
    recurrence: null,
    reminderLeadDays: null,
    seriesId: null,
    setlist,
    title: 'Concert',
    venue: 'Genève',
  };
}

function group(overrides: Partial<MusicGroup> = {}): MusicGroup {
  return {
    autoSosEnabled: false,
    autoSosMinLevel: null,
    comments: [],
    documents: [],
    emoji: '🎷',
    events: [],
    id: 'group-1',
    isPublic: false,
    leaderId: 'leader',
    members: [],
    messages: [],
    name: 'Blue Notes',
    pendingInvitations: [],
    photoUrl: null,
    repertoire: [],
    ...overrides,
  };
}

describe('ordre optimiste du répertoire et des setlists', () => {
  it('applique le même ordre que le RPC sans toucher une suggestion intercalée', () => {
    const untouched = group({ id: 'group-2', name: 'Autre' });
    const source = group({ repertoire: [song('a'), song('pending', false), song('b')] });
    const result = applyOptimisticGroupRepertoireOrder([source, untouched], 'group-1', ['b', 'a']);

    expect(result[0]?.repertoire.map((item) => item.id)).toEqual(['b', 'pending', 'a']);
    expect(result[1]).toBe(untouched);
    expect(source.repertoire.map((item) => item.id)).toEqual(['a', 'pending', 'b']);
  });

  it('ne modifie que la setlist ciblée et conserve un snapshot restaurable', () => {
    const original = group({ events: [event([song('a'), song('pending', false), song('b')])] });
    const snapshot = [original];
    const optimistic = applyOptimisticEventSetlistOrder(snapshot, 'event-1', ['b', 'a']);

    expect(optimistic[0]?.events[0]?.setlist.map((item) => item.id)).toEqual(['b', 'pending', 'a']);
    expect(snapshot[0]).toBe(original);
    expect(snapshot[0]?.events[0]?.setlist.map((item) => item.id)).toEqual(['a', 'pending', 'b']);
  });
});
