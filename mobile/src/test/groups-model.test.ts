import { describe, expect, it } from '@jest/globals';

import {
  aggregateGroupReactions,
  buildGroupMessageTimeline,
  buildEventSavePayloads,
  groupEventVenueLabel,
  groupLineupState,
  groupMessageAttachment,
  groupSongFromJson,
  groupSongToJson,
  isValidGroupMessage,
  mergeGroupMessagesNewestFirst,
  missingGroupEventRoles,
  optimisticGroupReactions,
  recurrenceDates,
  reorderSongs,
  parseGroupEventVenueLabel,
  type GroupEvent,
  type GroupMessage,
  type GroupMember,
  type GroupSong,
} from '@/features/groups/group-model';

function song(id: string, approved = true): GroupSong {
  return {
    albumTitle: null,
    artist: 'Miles Davis',
    artworkUrl: null,
    catalogId: `apple:${id}`,
    chords: null,
    durationMilliseconds: null,
    form: null,
    genre: 'Jazz',
    id,
    irealDisabled: false,
    irealUrl: null,
    isApproved: approved,
    key: 'Bb',
    platformLinks: {},
    previewUrl: null,
    releaseYear: 1959,
    solos: ['PROFILE-A'],
    suggestedBy: 'profile-a',
    tempoBpm: 120,
    title: `Song ${id}`,
    trackUrl: null,
  };
}

function message(
  id: string,
  createdAt: string,
  overrides: Partial<GroupMessage> = {},
): GroupMessage {
  return {
    attachmentName: null,
    attachmentPath: null,
    attachmentSize: null,
    attachmentType: null,
    createdAt,
    deletedAt: null,
    editedAt: null,
    groupId: 'group-1',
    id,
    reactions: [],
    senderId: 'profile-a',
    senderName: 'Alice',
    senderPhotoUrl: null,
    text: id,
    ...overrides,
  };
}

describe('contrat JSON des morceaux de groupe', () => {
  it('décode le snake_case Swift/Supabase et canonise les UUID en minuscules', () => {
    const decoded = groupSongFromJson({
      artist: 'Miles Davis',
      catalog_id: 'apple:123',
      id: 'ABCDEFAB-0000-0000-0000-000000000001',
      is_approved: true,
      solos: ['ABCDEFAB-0000-0000-0000-000000000002'],
      suggested_by: 'profile-a',
      tempo_bpm: 118,
      title: 'So What',
    });
    expect(decoded).toMatchObject({
      catalogId: 'apple:123',
      id: 'abcdefab-0000-0000-0000-000000000001',
      isApproved: true,
      solos: ['abcdefab-0000-0000-0000-000000000002'],
      tempoBpm: 118,
    });
    expect(groupSongToJson(decoded!)).toMatchObject({
      catalog_id: 'apple:123',
      is_approved: true,
      tempo_bpm: 118,
    });
  });

  it('ignore une entrée malformée au lieu de fabriquer un morceau', () => {
    expect(groupSongFromJson({ artist: 'Sans titre' })).toBeNull();
    expect(groupSongFromJson('mauvais')).toBeNull();
  });
});

describe('réactions, ordre et messages', () => {
  it('agrège uniquement les six réactions serveur actives', () => {
    expect(
      aggregateGroupReactions(
        [
          { emoji: '👍', profileId: 'me', removedAt: null },
          { emoji: '👍', profileId: 'other', removedAt: null },
          { emoji: '❤️', profileId: 'other', removedAt: '2026-08-30T10:00:00Z' },
          { emoji: '🔥', profileId: 'other', removedAt: null },
        ],
        'me',
      ),
    ).toEqual([{ count: 2, emoji: '👍', reactedByMe: true }]);
  });

  it('réordonne les validés sans déplacer les suggestions en attente', () => {
    expect(
      reorderSongs([song('a'), song('pending', false), song('b')], ['b', 'a']).map(
        (item) => item.id,
      ),
    ).toEqual(['b', 'a', 'pending']);
  });

  it('accepte texte ou pièce jointe, jamais un message vide ou trop long', () => {
    expect(isValidGroupMessage(' Salut ')).toBe(true);
    expect(isValidGroupMessage('', true)).toBe(true);
    expect(isValidGroupMessage('   ')).toBe(false);
    expect(isValidGroupMessage('x'.repeat(4_001))).toBe(false);
  });

  it('déduplique les échos Realtime et garde les métadonnées enrichies du cache', () => {
    const cached = message('same', '2026-09-01T10:00:00Z', {
      reactions: [{ count: 1, emoji: '👍', reactedByMe: true }],
      senderName: 'Alice',
      senderPhotoUrl: 'https://example.test/alice.jpg',
    });
    const realtime = message('same', '2026-09-01T10:00:00Z', {
      editedAt: '2026-09-01T10:02:00Z',
      senderName: 'Membre',
      text: 'corrigé',
    });
    expect(mergeGroupMessagesNewestFirst([cached, cached], realtime)).toEqual([
      expect.objectContaining({
        editedAt: '2026-09-01T10:02:00Z',
        reactions: [{ count: 1, emoji: '👍', reactedByMe: true }],
        senderName: 'Alice',
        senderPhotoUrl: 'https://example.test/alice.jpg',
        text: 'corrigé',
      }),
    ]);
  });

  it('construit une timeline inversée stable avec typing et séparateurs de jours', () => {
    const timeline = buildGroupMessageTimeline(
      [
        message('old', '2026-09-01T08:00:00Z'),
        message('new', '2026-09-02T08:00:00Z'),
        message('new', '2026-09-02T08:00:00Z'),
      ],
      true,
    );
    expect(timeline.map((item) => item.id)).toEqual([
      'typing',
      'message:new',
      'day:2026-09-02',
      'message:old',
      'day:2026-09-01',
    ]);
  });

  it('partage le contrat de pièce jointe et la règle de réaction unique des messages directs', () => {
    const attached = message('file', '2026-09-01T08:00:00Z', {
      attachmentName: 'setlist.pdf',
      attachmentPath: 'group/g/file.pdf',
      attachmentSize: 2_048,
      attachmentType: 'application/pdf',
    });
    expect(groupMessageAttachment(attached)).toEqual({
      byteCount: 2_048,
      contentType: 'application/pdf',
      fileName: 'setlist.pdf',
      remotePath: 'group/g/file.pdf',
    });
    expect(
      optimisticGroupReactions(
        [
          { count: 2, emoji: '👍', reactedByMe: true },
          { count: 1, emoji: '❤️', reactedByMe: false },
        ],
        '❤️',
      ),
    ).toEqual([
      { count: 1, emoji: '👍', reactedByMe: false },
      { count: 2, emoji: '❤️', reactedByMe: true },
    ]);
  });
});

describe('événements récurrents et line-up', () => {
  it('borne une série à un an et conserve exactement l’heure', () => {
    const dates = recurrenceDates('2026-09-01T18:30:00.000Z', 'Chaque semaine', 80);
    expect(dates).toHaveLength(52);
    expect(dates[0]).toBe('2026-09-01T18:30:00.000Z');
    expect(dates[1]).toBe('2026-09-08T18:30:00.000Z');
  });

  it('sépare le lieu public de l’adresse exacte dans le payload atomique', () => {
    const payload = buildEventSavePayloads(
      {
        city: ' Genève ',
        countryCode: 'ch',
        date: '2026-09-10T18:00:00.000Z',
        exactAddress: ' Rue des Alpes 10 ',
        kind: 'Concert',
        occurrenceCount: 1,
        postalCode: '1201',
        recurrence: 'Ponctuel',
        reminderLeadDays: 2,
        title: ' Release party ',
        venue: ' AMR ',
      },
      ['event-1'],
      null,
    )[0];
    expect(payload).toMatchObject({
      exact_address: 'Rue des Alpes 10',
      public_location_label: 'AMR · 1201 Genève · CH',
      title: 'Release party',
    });
  });

  it('partage exactement le format de lieu Swift et relit les anciennes lignes', () => {
    const label = groupEventVenueLabel({
      city: 'Genève',
      countryCode: 'ch',
      postalCode: '1201',
      venue: 'AMR',
    });
    expect(label).toBe('AMR · 1201 Genève · CH');
    expect(parseGroupEventVenueLabel(label)).toEqual({
      city: 'Genève',
      countryCode: 'CH',
      postalCode: '1201',
      venue: 'AMR',
    });
    expect(parseGroupEventVenueLabel('Ancienne salle')).toEqual({
      city: '',
      countryCode: 'CH',
      postalCode: '',
      venue: 'Ancienne salle',
    });
  });

  it('annonce complet seulement si chaque rôle est couvert par une présence', () => {
    const members: GroupMember[] = [
      {
        id: 'piano',
        instruments: ['Piano'],
        isLeader: true,
        kind: 'permanent',
        name: 'Piano',
        photoUrl: null,
        role: 'Piano',
      },
      {
        id: 'drums',
        instruments: ['Batterie'],
        isLeader: false,
        kind: 'permanent',
        name: 'Drums',
        photoUrl: null,
        role: 'Batterie',
      },
    ];
    const event: GroupEvent = {
      attendance: [
        { profileId: 'piano', status: 'available' },
        { profileId: 'drums', status: 'available' },
      ],
      date: '2026-09-20T18:00:00.000Z',
      exactAddress: null,
      groupId: 'group-1',
      id: 'event-1',
      kind: 'Concert',
      privateLocationState: 'absent',
      publicLocationLabel: 'AMR',
      recurrence: null,
      reminderLeadDays: 2,
      seriesId: null,
      setlist: [],
      title: 'Concert',
      venue: 'AMR',
    };
    expect(groupLineupState(event, members, new Date('2026-09-01T00:00:00Z'))).toBe('complete');
    expect(
      groupLineupState(
        { ...event, attendance: [{ profileId: 'piano', status: 'available' }] },
        members,
        new Date('2026-09-19T00:00:00Z'),
      ),
    ).toBe('late');
    const absentDrums = {
      ...event,
      attendance: [{ profileId: 'piano', status: 'available' as const }],
    };
    expect(missingGroupEventRoles(absentDrums, members)).toEqual(['Batterie']);
    expect(
      groupLineupState(absentDrums, members, new Date('2026-09-01T00:00:00Z'), ['Batterie']),
    ).toBe('complete');
    expect(missingGroupEventRoles(absentDrums, members, ['Batterie'])).toEqual([]);
  });

  it('ne déclare pas complet un groupe sans rôles tant que tout le monde n’est pas dispo', () => {
    const members: GroupMember[] = [
      {
        id: 'one',
        instruments: [],
        isLeader: true,
        kind: 'permanent',
        name: 'One',
        photoUrl: null,
        role: null,
      },
      {
        id: 'two',
        instruments: [],
        isLeader: false,
        kind: 'permanent',
        name: 'Two',
        photoUrl: null,
        role: null,
      },
    ];
    const event: GroupEvent = {
      attendance: [{ profileId: 'one', status: 'available' }],
      date: '2026-09-20T18:00:00.000Z',
      exactAddress: null,
      groupId: 'group-1',
      id: 'event-1',
      kind: 'Concert',
      privateLocationState: 'restricted',
      publicLocationLabel: 'Genève',
      recurrence: null,
      reminderLeadDays: 2,
      seriesId: null,
      setlist: [],
      title: 'Concert',
      venue: 'Genève',
    };
    expect(groupLineupState(event, members, new Date('2026-09-01T00:00:00Z'))).toBe('forming');
    expect(
      groupLineupState(
        {
          ...event,
          attendance: [
            { profileId: 'one', status: 'available' },
            { profileId: 'two', status: 'available' },
          ],
        },
        members,
      ),
    ).toBe('complete');
  });
});
