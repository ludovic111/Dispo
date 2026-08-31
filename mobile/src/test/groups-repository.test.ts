import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { openDocumentPreview } from '../../modules/dispo-document-preview';

import type {
  GroupDocument,
  GroupEvent,
  GroupSong,
  MusicGroup,
} from '@/features/groups/group-model';
import {
  cancelGroupEvent,
  createGroup,
  enrichSongCatalogResult,
  isAllowedGroupDocumentExtension,
  openGroupDocument,
  saveGroupRepertoire,
  searchSongCatalog,
  setGroupMessageReaction,
  updateGroupEvent,
} from '@/features/groups/group-repository';
import {
  loadAndSeedGroupSeen,
  markGroupSeen,
  unreadGroupMessageCount,
} from '@/features/groups/group-seen-store';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../modules/dispo-document-preview', () => ({ openDocumentPreview: jest.fn() }));
jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);

function song(): GroupSong {
  return {
    albumTitle: null,
    artist: 'Miles Davis',
    artworkUrl: null,
    catalogId: 'apple:1',
    canonicalSongId: null,
    chords: null,
    composer: null,
    durationMilliseconds: null,
    form: null,
    genre: null,
    genres: [],
    id: 'song-1',
    irealDisabled: false,
    irealUrl: null,
    isrc: null,
    isApproved: true,
    key: 'Bb',
    metadataSource: null,
    metadataUpdatedAt: null,
    platformIds: {},
    platformLinks: {},
    previewUrl: null,
    releaseYear: null,
    solos: [],
    suggestedBy: 'me',
    tempoBpm: 120,
    title: 'So What',
    trackUrl: null,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('catalogue musical partagé', () => {
  it('fusionne le cache Supabase et Apple en gardant les liens exacts du cache', async () => {
    const rpc = jest.fn(async () => ({
      data: [
        {
          album_title: 'Kind of Blue',
          artist: 'Miles Davis',
          artwork_url: null,
          composer: null,
          duration_ms: 545_000,
          genres: ['Jazz'],
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          isrc: 'USSM15900123',
          musical_key: 'Dm',
          metadata_source: 'catalog-test',
          metadata_updated_at: '2026-08-31T18:00:00.000Z',
          platform_ids: { appleMusic: '123' },
          platform_links: {
            spotify: 'https://open.spotify.com/track/exact',
          },
          release_year: 1959,
          tempo_bpm: 136,
          title: 'So What',
        },
      ],
      error: null,
    }));
    mockedClient.mockReturnValue({ rpc } as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({
        results: [
          {
            artistName: 'Miles Davis',
            artworkUrl100: 'https://example.com/100x100bb.jpg',
            collectionName: 'Kind of Blue (Legacy Edition)',
            previewUrl: 'https://example.com/preview.m4a',
            trackId: 123,
            trackName: 'So What',
            trackViewUrl: 'https://music.apple.com/ch/song/123',
          },
        ],
      }),
      ok: true,
    } as Response);

    await expect(searchSongCatalog('So What')).resolves.toEqual([
      expect.objectContaining({
        canonicalSongId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        artworkUrl: 'https://example.com/600x600bb.jpg',
        previewUrl: 'https://example.com/preview.m4a',
        key: 'Dm',
        platformLinks: {
          appleMusic: 'https://music.apple.com/ch/song/123',
          spotify: 'https://open.spotify.com/track/exact',
        },
        tempoBpm: 136,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith(
      'search_song_catalog',
      expect.objectContaining({ p_market: 'CH', p_query: 'So What' }),
    );
  });

  it('conserve deux enregistrements distincts qui partagent artiste et titre', async () => {
    const rpc = jest.fn(async () => ({
      data: [
        {
          artist: 'Miles Davis',
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          isrc: 'USSM15900123',
          platform_ids: { appleMusic: '123' },
          title: 'So What',
        },
        {
          artist: 'Miles Davis',
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          isrc: 'USSM19990123',
          platform_ids: { appleMusic: '456' },
          title: 'So What',
        },
      ],
      error: null,
    }));
    mockedClient.mockReturnValue({ rpc } as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ results: [] }),
      ok: true,
    } as Response);

    const results = await searchSongCatalog('So What');

    expect(results).toHaveLength(2);
    expect(results.map(({ isrc }) => isrc)).toEqual(['USSM15900123', 'USSM19990123']);
  });

  it('demande un enrichissement authentifié puis relit la source canonique', async () => {
    const invoke = jest.fn(async () => ({
      data: { audio_metrics: 'client_fallback', queued: true },
      error: null,
    }));
    const rpc = jest.fn(async () => ({
      data: [
        {
          artist: 'Miles Davis',
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          platform_ids: { appleMusic: '123' },
          platform_links: { spotify: 'https://open.spotify.com/track/exact' },
          title: 'So What',
        },
      ],
      error: null,
    }));
    mockedClient.mockReturnValue({ functions: { invoke }, rpc } as never);
    const source = {
      albumTitle: null,
      artist: 'Miles Davis',
      artworkUrl: null,
      catalogId: 'apple:123',
      canonicalSongId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      composer: null,
      durationMilliseconds: null,
      genre: null,
      genres: [],
      isrc: null,
      key: null,
      metadataSource: 'apple-itunes-search',
      metadataUpdatedAt: '2026-08-31T18:00:00.000Z',
      platformIds: { appleMusic: '123' },
      platformLinks: {},
      previewUrl: null,
      releaseYear: null,
      tempoBpm: null,
      title: 'So What',
      trackUrl: null,
    };

    await expect(enrichSongCatalogResult(source)).resolves.toEqual({
      audioMetrics: 'client_fallback',
      refreshed: expect.objectContaining({
        canonicalSongId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platformLinks: { spotify: 'https://open.spotify.com/track/exact' },
      }),
    });
    expect(invoke).toHaveBeenCalledWith('song-enrichment', {
      body: { action: 'enqueue', song_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
  });

  it('enregistre côté serveur une sélection Apple encore sans UUID canonique', async () => {
    const canonicalId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const invoke = jest.fn(async () => ({
      data: { audio_metrics: 'client_fallback', queued: true, song_id: canonicalId },
      error: null,
    }));
    const rpc = jest.fn(async () => ({
      data: [
        {
          artist: 'Santana',
          id: canonicalId,
          platform_ids: { appleMusic: '871146601' },
          platform_links: {
            appleMusic: 'https://music.apple.com/ch/album/oye-como-va/871146591?i=871146601',
          },
          title: 'Oye Como Va',
        },
      ],
      error: null,
    }));
    mockedClient.mockReturnValue({ functions: { invoke }, rpc } as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ results: [] }),
      ok: true,
    } as Response);

    const result = await enrichSongCatalogResult({
      albumTitle: 'Abraxas',
      artist: 'Santana',
      artworkUrl: null,
      catalogId: 'apple:871146601',
      canonicalSongId: null,
      composer: null,
      durationMilliseconds: 260_229,
      genre: 'Rock',
      genres: ['Rock'],
      isrc: null,
      key: null,
      metadataSource: 'apple-itunes-search',
      metadataUpdatedAt: '2026-08-31T18:00:00.000Z',
      platformIds: { appleMusic: '871146601' },
      platformLinks: {
        appleMusic: 'https://music.apple.com/ch/album/oye-como-va/871146591?i=871146601',
      },
      previewUrl: null,
      releaseYear: 1970,
      tempoBpm: null,
      title: 'Oye Como Va',
      trackUrl: 'https://music.apple.com/ch/album/oye-como-va/871146591?i=871146601',
    });

    expect(invoke).toHaveBeenCalledWith('song-enrichment', {
      body: {
        action: 'enqueue',
        apple_id: '871146601',
        apple_url: 'https://music.apple.com/ch/album/oye-como-va/871146591?i=871146601',
      },
    });
    expect(result.refreshed?.canonicalSongId).toBe(canonicalId);
  });
});

describe('documents de groupe', () => {
  it('n’accepte que les formats annoncés dans l’interface native', () => {
    expect(['jpg', 'jpeg', 'png', 'pdf', 'txt'].every(isAllowedGroupDocumentExtension)).toBe(true);
    expect(['doc', 'docx', 'pages', 'zip', 'exe'].some(isAllowedGroupDocumentExtension)).toBe(
      false,
    );
    expect(isAllowedGroupDocumentExtension(' PDF ')).toBe(true);
  });

  it('ouvre le document privé avec une URL signée de 60 secondes et son vrai nom', async () => {
    const document: GroupDocument = {
      addedBy: 'Miles',
      addedById: 'profile-1',
      createdAt: '2026-08-31T18:00:00.000Z',
      extension: 'pdf',
      groupId: 'group-1',
      id: 'document-1',
      instrument: 'Trompette',
      path: 'group-1/document-1.pdf',
      songId: 'song-1',
      title: 'So What — Trompette',
    };
    const createSignedUrl = jest.fn(async () => ({
      data: { signedUrl },
      error: null,
    }));
    const from = jest.fn(() => ({ createSignedUrl }));
    const signedUrl =
      'https://project.supabase.co/storage/v1/object/sign/group-docs/group-1/document-1.pdf?token=short';
    mockedClient.mockReturnValue({ storage: { from } } as never);

    await openGroupDocument(document);

    expect(from).toHaveBeenCalledWith('group-docs');
    expect(createSignedUrl).toHaveBeenCalledWith(document.path, 60);
    expect(openDocumentPreview).toHaveBeenCalledWith({
      extension: 'pdf',
      signedUrl,
      title: 'So What — Trompette',
    });
  });
});

describe('mutations du repository Groupes', () => {
  it('crée le groupe puis des invitations explicites, jamais des adhésions directes', async () => {
    const groupSingle = jest.fn(async () => ({ data: { id: 'group-1' }, error: null }));
    const groupSelect = jest.fn(() => ({ single: groupSingle }));
    const groupInsert = jest.fn(() => ({ select: groupSelect }));
    const invitationInsert = jest.fn(async () => ({ error: null }));
    const from = jest.fn((table: string) =>
      table === 'music_groups' ? { insert: groupInsert } : { insert: invitationInsert },
    );
    mockedClient.mockReturnValue({ from } as never);

    await expect(
      createGroup('me', {
        emoji: '🎷',
        memberIds: ['member-1', 'member-1', 'me'],
        name: ' Quartet ',
      }),
    ).resolves.toEqual({ failedInvitationCount: 0, groupId: 'group-1' });
    expect(groupInsert).toHaveBeenCalledWith({ emoji: '🎷', leader_id: 'me', name: 'Quartet' });
    expect(invitationInsert).toHaveBeenCalledWith({
      group_id: 'group-1',
      invited_by: 'me',
      kind: 'permanent',
      profile_id: 'member-1',
    });
    expect(from).not.toHaveBeenCalledWith('group_members');
  });

  it('envoie la suppression de réaction comme NULL malgré le type généré historique', async () => {
    const rpc = jest.fn(async () => ({ error: null }));
    mockedClient.mockReturnValue({ rpc } as never);
    await setGroupMessageReaction('message-1', null);
    expect(rpc).toHaveBeenCalledWith('set_group_message_reaction', {
      p_emoji: null,
      p_message: 'message-1',
    });
  });

  it('utilise la fusion atomique à trois voies pour le répertoire', async () => {
    const rpc = jest.fn(async () => ({ error: null }));
    mockedClient.mockReturnValue({ rpc } as never);
    const original = [song()];
    const desired = [{ ...song(), tempoBpm: 132 }];
    await saveGroupRepertoire('group-1', original, desired);
    expect(rpc).toHaveBeenCalledWith(
      'merge_group_repertoire_snapshot',
      expect.objectContaining({
        p_group_id: 'group-1',
        p_desired_songs: [expect.objectContaining({ tempo_bpm: 132 })],
        p_original_songs: [expect.objectContaining({ tempo_bpm: 120 })],
      }),
    );
  });

  it('édite un événement et son adresse via la RPC atomique puis notifie une fois', async () => {
    const rpc = jest.fn(async () => ({ error: null }));
    const inIds = jest.fn(async () => ({ error: null }));
    const eqGroup = jest.fn(() => ({ in: inIds }));
    const update = jest.fn(() => ({ eq: eqGroup }));
    const from = jest.fn(() => ({ update }));
    mockedClient.mockReturnValue({ from, rpc } as never);
    const event: GroupEvent = {
      attendance: [],
      date: '2026-09-10T18:00:00.000Z',
      exactAddress: 'Rue privée 1',
      groupId: 'group-1',
      id: 'event-1',
      kind: 'Concert',
      privateLocationState: 'available',
      publicLocationLabel: 'AMR',
      recurrence: null,
      reminderLeadDays: 2,
      seriesId: null,
      setlist: [],
      title: 'Concert',
      venue: 'AMR',
    };
    await updateGroupEvent({
      city: 'Genève',
      clearExactAddress: true,
      countryCode: 'CH',
      date: '2026-09-10T20:00:00.000Z',
      event,
      events: [event],
      exactAddress: '',
      groupId: 'group-1',
      latitude: null,
      leaderId: 'leader',
      longitude: null,
      postalCode: '1201',
      reminderLeadDays: 1,
      scope: 'thisDate',
      title: ' Nouveau titre ',
      venue: ' Cave 12 ',
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'save_group_events_with_locations',
      expect.objectContaining({
        p_events: [
          expect.objectContaining({
            clear_exact_address: true,
            exact_address: '',
            public_location_label: 'Cave 12 · 1201 Genève · CH',
            title: 'Nouveau titre',
          }),
        ],
        p_group_id: 'group-1',
        p_mode: 'update',
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(2, 'notify_group_event_moved', {
      p_dates: 1,
      p_event_id: 'event-1',
    });
  });

  it('annule une série avec un seul appel et sans identifiants dupliqués', async () => {
    const rpc = jest.fn(async () => ({ error: null }));
    mockedClient.mockReturnValue({ rpc } as never);
    await cancelGroupEvent(['event-1', 'event-2', 'event-1']);
    expect(rpc).toHaveBeenCalledWith('cancel_group_events', {
      p_event_ids: ['event-1', 'event-2'],
    });
  });
});

describe('repère local vu/non lu identique à Swift', () => {
  const group = (createdAt: string): MusicGroup => ({
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
    messages: [
      {
        attachmentName: null,
        attachmentPath: null,
        attachmentSize: null,
        attachmentType: null,
        createdAt,
        deletedAt: null,
        editedAt: null,
        groupId: 'group-1',
        id: 'message-1',
        reactions: [],
        senderId: 'other',
        senderName: 'Other',
        senderPhotoUrl: null,
        text: 'Salut',
      },
    ],
    name: 'Quartet',
    pendingInvitations: [],
    photoUrl: null,
    repertoire: [],
  });

  it('initialise un groupe jamais vu à maintenant sans compter tout son historique', async () => {
    const seen = await loadAndSeedGroupSeen('me', ['group-1'], new Date('2026-09-01T10:00:00Z'));
    expect(unreadGroupMessageCount(group('2026-08-30T10:00:00Z'), 'me', seen)).toBe(0);
  });

  it('compte seulement les messages reçus après la visite et retombe à zéro après ouverture', async () => {
    const before = await loadAndSeedGroupSeen('me', ['group-1'], new Date('2026-09-01T10:00:00Z'));
    const current = group('2026-09-01T10:05:00Z');
    expect(unreadGroupMessageCount(current, 'me', before)).toBe(1);
    const after = await markGroupSeen('me', 'group-1', new Date('2026-09-01T10:06:00Z'));
    expect(unreadGroupMessageCount(current, 'me', after)).toBe(0);
  });
});
