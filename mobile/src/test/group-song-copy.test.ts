import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { GroupEvent, GroupSong, MusicGroup } from '@/features/groups/group-model';
import { copyGroupSongToDestinations } from '@/features/groups/group-repository';
import {
  applyOptimisticSongCopies,
  copiedGroupSong,
  groupSongCopyDestinations,
  groupSongsMatch,
  removeOptimisticSongCopies,
  type GroupSongCopyTarget,
} from '@/features/groups/group-song-copy';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);

function song(overrides: Partial<GroupSong> = {}): GroupSong {
  return {
    albumTitle: 'Kind of Blue',
    artist: 'Miles Davis',
    artworkUrl: 'https://example.com/cover.jpg',
    catalogId: 'apple:123',
    canonicalSongId: null,
    chords: '| Dm7 |',
    composer: 'Miles Davis',
    durationMilliseconds: 545_000,
    form: 'AABA',
    genre: 'Jazz',
    genres: ['Jazz'],
    id: 'song-source',
    irealDisabled: false,
    irealUrl: 'irealbook://so-what',
    isrc: 'USSM15900123',
    isApproved: true,
    key: 'Dm',
    metadataSource: 'apple-itunes-search',
    metadataUpdatedAt: '2026-08-31T12:00:00.000Z',
    platformIds: { appleMusic: '123' },
    platformLinks: { spotify: 'https://open.spotify.com/track/1' },
    previewUrl: 'https://example.com/preview.m4a',
    releaseYear: 1959,
    solos: ['profile-1', 'profile-2'],
    suggestedBy: 'source-member',
    tempoBpm: 138,
    title: 'So What',
    trackUrl: 'https://music.apple.com/song/1',
    ...overrides,
  };
}

function event(id: string, date: string, overrides: Partial<GroupEvent> = {}): GroupEvent {
  return {
    attendance: [],
    date,
    exactAddress: null,
    groupId: 'group-1',
    id,
    kind: 'Concert',
    privateLocationState: 'absent',
    publicLocationLabel: 'Genève',
    recurrence: null,
    reminderLeadDays: null,
    seriesId: null,
    setlist: [],
    title: id,
    venue: 'Cave 12',
    ...overrides,
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

function jsonSong(value: GroupSong): Record<string, unknown> {
  return {
    album_title: value.albumTitle,
    artist: value.artist,
    artwork_url: value.artworkUrl,
    catalog_id: value.catalogId,
    canonical_song_id: value.canonicalSongId,
    chords: value.chords,
    composer: value.composer,
    duration_ms: value.durationMilliseconds,
    form: value.form,
    genre: value.genre,
    genres: value.genres,
    id: value.id,
    ireal_disabled: value.irealDisabled,
    ireal_url: value.irealUrl,
    isrc: value.isrc,
    is_approved: value.isApproved,
    key: value.key,
    metadata_source: value.metadataSource,
    metadata_updated_at: value.metadataUpdatedAt,
    platform_ids: value.platformIds,
    platform_links: value.platformLinks,
    preview_url: value.previewUrl,
    release_year: value.releaseYear,
    solos: value.solos,
    suggested_by: value.suggestedBy,
    tempo_bpm: value.tempoBpm,
    title: value.title,
    track_url: value.trackUrl,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('modèle de copie d’un morceau', () => {
  it('déduplique par identité canonique, ISRC, catalogue puis texte normalisé', () => {
    expect(
      groupSongsMatch(
        song({ canonicalSongId: 'aaaaaaaa-0000-4000-8000-000000000001' }),
        song({
          artist: 'Autre',
          canonicalSongId: 'AAAAAAAA-0000-4000-8000-000000000001',
          catalogId: null,
          isrc: null,
          title: 'Autre',
        }),
      ),
    ).toBe(true);
    expect(
      groupSongsMatch(
        song({ canonicalSongId: null, catalogId: null, isrc: 'US-SM1-59-00123' }),
        song({ artist: 'Autre', canonicalSongId: null, catalogId: null, title: 'X' }),
      ),
    ).toBe(true);
    expect(
      groupSongsMatch(song(), song({ artist: 'Autre', catalogId: 'APPLE:123', title: 'X' })),
    ).toBe(true);
    expect(
      groupSongsMatch(
        song({ catalogId: null }),
        song({ artist: ' miles  davis ', catalogId: 'other:9', title: 'Sô what' }),
      ),
    ).toBe(true);
  });

  it('préserve toutes les métadonnées mais recrée identité, validation et solos', () => {
    const source = song();
    const copy = copiedGroupSong(source, {
      approved: false,
      id: 'COPY-ID',
      suggestedBy: 'member-9',
    });
    expect(copy).toEqual({
      ...source,
      genres: ['Jazz'],
      id: 'copy-id',
      isApproved: false,
      platformIds: { appleMusic: '123' },
      platformLinks: { spotify: 'https://open.spotify.com/track/1' },
      solos: [],
      suggestedBy: 'member-9',
    });
    expect(copy.platformLinks).not.toBe(source.platformLinks);
    expect(copy.platformIds).not.toBe(source.platformIds);
    expect(copy.genres).not.toBe(source.genres);
    expect(source.solos).toEqual(['profile-1', 'profile-2']);
  });

  it('montre passé, futur, sans date, type et groupe puis le répertoire', () => {
    const source = song();
    const groups = [
      group({
        events: [
          event('future', '2026-11-03T19:00:00.000Z', { kind: 'Jam' }),
          event('undated', 'date-invalide', { kind: 'Répétition' }),
          event('past', '2026-01-02T19:00:00.000Z', { kind: 'Concert' }),
        ],
      }),
    ];
    const destinations = groupSongCopyDestinations(groups, source, {
      sourceEventId: null,
      sourceGroupId: 'source-group',
      userId: 'leader',
    });
    expect(destinations.map((destination) => destination.id)).toEqual([
      'event:past',
      'event:future',
      'event:undated',
      'group:group-1',
    ]);
    expect(destinations[0]).toEqual(
      expect.objectContaining({ groupName: 'Blue Notes', name: 'past', type: 'Concert' }),
    );
    expect(destinations[2]).toEqual(expect.objectContaining({ date: null, type: 'Répétition' }));
  });

  it('exclut seulement la collection source et marque les doublons', () => {
    const source = song();
    const destinations = groupSongCopyDestinations(
      [
        group({
          events: [
            event('source-event', '2026-01-02T19:00:00.000Z', { setlist: [source] }),
            event('other-event', '2026-02-02T19:00:00.000Z', {
              setlist: [song({ catalogId: null, id: 'duplicate', title: 'Sô What' })],
            }),
          ],
          repertoire: [],
        }),
      ],
      source,
      { sourceEventId: 'source-event', sourceGroupId: 'group-1', userId: 'member' },
    );
    expect(destinations.some((destination) => destination.id === 'event:source-event')).toBe(false);
    expect(destinations.find((destination) => destination.id === 'group:group-1')).toBeDefined();
    expect(destinations.find((destination) => destination.id === 'event:other-event')).toEqual(
      expect.objectContaining({ isAlreadyPresent: true, isDirect: false }),
    );
  });

  it('met le cache à jour immédiatement puis sait retirer seulement les échecs', () => {
    const sourceGroup = group();
    const target: GroupSongCopyTarget = {
      copy: copiedGroupSong(song(), { approved: true, id: 'copy-1', suggestedBy: 'leader' }),
      destinationId: 'event:event-1',
      eventId: 'event-1',
      groupId: 'group-1',
    };
    const groups = [{ ...sourceGroup, events: [event('event-1', '2026-10-10T18:00:00.000Z')] }];
    const optimistic = applyOptimisticSongCopies(groups, [target]);
    expect(optimistic[0]?.events[0]?.setlist.map((item) => item.id)).toEqual(['copy-1']);
    expect(removeOptimisticSongCopies(optimistic, [target])).toEqual(groups);
  });
});

describe('persistance de la copie via les RPC existants', () => {
  it('relit le répertoire, fusionne la copie complète et ignore une destination répétée', async () => {
    const current = song({
      id: 'existing',
      title: 'Footprints',
      catalogId: 'apple:456',
      isrc: null,
    });
    const single = jest.fn(async () => ({
      data: { id: 'group-1', repertoire: [jsonSong(current)] },
      error: null,
    }));
    const rpc = jest.fn(async () => ({ data: [], error: null }));
    mockedClient.mockReturnValue({
      from: jest.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
      rpc,
    } as never);
    const copy = copiedGroupSong(song(), { approved: true, id: 'copy-1', suggestedBy: 'leader' });
    const target: GroupSongCopyTarget = {
      copy,
      destinationId: 'group:group-1',
      eventId: null,
      groupId: 'group-1',
    };
    await expect(copyGroupSongToDestinations([target, target])).resolves.toEqual([
      { destinationId: 'group:group-1', status: 'copied' },
    ]);
    expect(single).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'merge_group_repertoire_snapshot',
      expect.objectContaining({
        p_desired_songs: [
          expect.objectContaining({ id: 'existing' }),
          expect.objectContaining({
            catalog_id: 'apple:123',
            chords: '| Dm7 |',
            id: 'copy-1',
            solos: [],
          }),
        ],
        p_group_id: 'group-1',
      }),
    );
  });

  it('fusionne aussi une setlist d’événement sans perdre son ordre existant', async () => {
    const first = song({ id: 'first', title: 'Footprints', catalogId: 'apple:456', isrc: null });
    const second = song({ id: 'second', title: 'Nardis', catalogId: 'apple:789', isrc: null });
    const single = jest.fn(async () => ({
      data: { group_id: 'group-1', setlist: [jsonSong(first), jsonSong(second)] },
      error: null,
    }));
    const rpc = jest.fn(async () => ({ data: [], error: null }));
    mockedClient.mockReturnValue({
      from: jest.fn(() => ({
        select: () => ({ eq: () => ({ eq: () => ({ single }) }) }),
      })),
      rpc,
    } as never);
    const target: GroupSongCopyTarget = {
      copy: copiedGroupSong(song(), {
        approved: false,
        id: 'event-copy',
        suggestedBy: 'member',
      }),
      destinationId: 'event:event-1',
      eventId: 'event-1',
      groupId: 'group-1',
    };
    await expect(copyGroupSongToDestinations([target])).resolves.toEqual([
      { destinationId: 'event:event-1', status: 'copied' },
    ]);
    expect(rpc).toHaveBeenCalledWith(
      'merge_event_setlist_snapshot',
      expect.objectContaining({
        p_desired_songs: [
          expect.objectContaining({ id: 'first' }),
          expect.objectContaining({ id: 'second' }),
          expect.objectContaining({ id: 'event-copy', is_approved: false }),
        ],
        p_event_id: 'event-1',
      }),
    );
  });

  it('refuse un doublon apparu sur un autre appareil sans écrire', async () => {
    const current = song({ id: 'remote-copy' });
    const single = jest.fn(async () => ({
      data: { id: 'group-1', repertoire: [jsonSong(current)] },
      error: null,
    }));
    const rpc = jest.fn();
    mockedClient.mockReturnValue({
      from: jest.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
      rpc,
    } as never);
    const target: GroupSongCopyTarget = {
      copy: copiedGroupSong(song(), { approved: true, id: 'copy-1', suggestedBy: 'leader' }),
      destinationId: 'group:group-1',
      eventId: null,
      groupId: 'group-1',
    };
    await expect(copyGroupSongToDestinations([target])).resolves.toEqual([
      { destinationId: 'group:group-1', status: 'already-exists' },
    ]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('distingue un refus RLS afin de donner un retour sûr', async () => {
    const single = jest.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'group_membership_required' },
    }));
    mockedClient.mockReturnValue({
      from: jest.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
    } as never);
    const target: GroupSongCopyTarget = {
      copy: copiedGroupSong(song(), { approved: false, id: 'copy-1', suggestedBy: 'member' }),
      destinationId: 'group:group-1',
      eventId: null,
      groupId: 'group-1',
    };
    await expect(copyGroupSongToDestinations([target])).resolves.toEqual([
      { destinationId: 'group:group-1', status: 'permission-denied' },
    ]);
  });
});
