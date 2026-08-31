import { describe, expect, it } from '@jest/globals';

import {
  attendancePayload,
  buildSessions,
  directResponsePayload,
  groupSessionsByMonth,
  pastSessionsSummary,
  sessionDestination,
  sessionsPresentation,
  type BuildSessionsInput,
  type SessionItem,
} from '@/features/sessions/session-model';

const now = new Date('2026-09-01T10:00:00.000Z');

function event(
  id: string,
  date: string,
  overrides: Partial<BuildSessionsInput['events'][number]> = {},
): BuildSessionsInput['events'][number] {
  return {
    date,
    groupId: 'group-1',
    id,
    kind: 'Concert',
    recurrence: null,
    reminderLeadDays: 2,
    seriesId: null,
    setlist: [],
    title: `Session ${id}`,
    venue: 'AMR Genève',
    ...overrides,
  };
}

function gig(
  id: string,
  date: string,
  overrides: Partial<BuildSessionsInput['gigs'][number]> = {},
): BuildSessionsInput['gigs'][number] {
  return {
    date,
    description: '',
    eventId: null,
    fee: null,
    filledInstruments: [],
    groupId: null,
    hostId: 'host-1',
    id,
    neighborhood: '',
    place: 'Genève',
    targetId: null,
    targetStatus: null,
    title: `SOS ${id}`,
    wantedInstruments: ['Guitare'],
    ...overrides,
  };
}

function sessionItem(id: string, date: string): SessionItem {
  return {
    approvedSongCount: 0,
    attendanceStatus: 'available',
    availableCount: 1,
    confirmDeadline: '2026-09-08T18:00:00.000Z',
    date,
    eventId: id,
    eventKind: 'Concert',
    gigId: null,
    groupEmoji: '🎸',
    groupId: 'group-1',
    groupName: 'Les Dispos',
    hostName: null,
    id: `group-${id}`,
    instrument: null,
    isFilled: true,
    lineupState: 'complete',
    missingRoles: [],
    pendingApplicantCount: 0,
    place: 'AMR Genève',
    presentCount: 1,
    recurrenceLabel: null,
    role: 'Guitare',
    rosterCount: 1,
    source: 'group',
    title: `Session ${id}`,
  };
}

function input(): BuildSessionsInput {
  return {
    applications: [
      { gigId: 'playing', instrument: 'Basse', musicianId: 'me', status: 'accepted' },
      { gigId: 'hosting', instrument: 'Batterie', musicianId: 'other', status: 'pending' },
      { gigId: 'applied', instrument: 'Piano', musicianId: 'me', status: 'pending' },
    ],
    attendance: [
      { eventId: 'pending-event', profileId: 'drummer', status: 'available' },
      { eventId: 'confirmed-event', profileId: 'me', status: 'available' },
      { eventId: 'confirmed-event', profileId: 'drummer', status: 'available' },
      { eventId: 'past-event', profileId: 'me', status: 'available' },
      { eventId: 'past-event', profileId: 'drummer', status: 'available' },
      { eventId: 'past-unavailable', profileId: 'me', status: 'unavailable' },
    ],
    events: [
      event('pending-event', '2026-09-10T18:00:00.000Z', {
        setlist: [
          { is_approved: true, title: 'Blue Train' },
          { is_approved: false, title: 'Footprints' },
        ],
      }),
      event('confirmed-event', '2026-09-20T18:00:00.000Z', {
        recurrence: 'Chaque semaine',
        seriesId: 'series-1',
      }),
      event('past-event', '2026-08-20T18:00:00.000Z', {
        kind: 'Répétition',
        setlist: [{ is_approved: true, title: 'Nardis' }],
      }),
      event('past-unavailable', '2026-08-10T18:00:00.000Z'),
      event('too-old', '2025-08-10T18:00:00.000Z'),
    ],
    gigs: [
      gig('direct', '2026-09-02T18:00:00.000Z', {
        description: 'Set de deux heures',
        fee: 180,
        targetId: 'me',
        targetStatus: 'pending',
      }),
      gig('linked-direct', '2026-09-10T18:00:00.000Z', {
        eventId: 'pending-event',
        targetId: 'me',
        targetStatus: 'pending',
      }),
      gig('playing', '2026-09-15T18:00:00.000Z'),
      gig('hosting', '2026-10-01T18:00:00.000Z', { hostId: 'me' }),
      gig('applied', '2026-10-02T18:00:00.000Z'),
      gig('linked-hosting', '2026-09-10T18:00:00.000Z', {
        eventId: 'pending-event',
        hostId: 'me',
      }),
    ],
    groups: [{ emoji: '🎸', id: 'group-1', name: 'Les Dispos' }],
    members: [
      { groupId: 'group-1', profileId: 'me', role: 'Guitare' },
      { groupId: 'group-1', profileId: 'drummer', role: 'Batterie' },
    ],
    profiles: [
      { id: 'host-1', name: 'Raphaël' },
      { id: 'me', name: 'Ludovic' },
    ],
    userId: 'me',
  };
}

describe('agenda Sessions', () => {
  it("ouvre une date de groupe dans son événement et un SOS dans l'annonce", () => {
    expect(sessionDestination(sessionItem('event-42', '2026-09-20T18:00:00.000Z'))).toBe(
      '/groups/group-1/events/event-42',
    );
    expect(
      sessionDestination({
        ...sessionItem('event-42', '2026-09-20T18:00:00.000Z'),
        eventId: null,
        gigId: 'gig-42',
        groupId: null,
      }),
    ).toBe('/gigs/gig-42');
  });

  it('fusionne groupes, SOS suivis et candidatures sans doubler un SOS lié à une date', () => {
    const data = buildSessions(input(), now);
    expect(data.upcoming.map((item) => item.id)).toEqual([
      'group-pending-event',
      'playing-playing',
      'group-confirmed-event',
      'hosting-hosting',
      'applied-applied',
    ]);
    expect(data.upcoming.some((item) => item.id.includes('linked'))).toBe(false);
    expect(data.upcoming.find((item) => item.id === 'hosting-hosting')).toMatchObject({
      pendingApplicantCount: 1,
      source: 'hosting',
    });
    expect(data.upcoming.find((item) => item.id === 'group-confirmed-event')).toMatchObject({
      lineupState: 'complete',
      recurrenceLabel: 'Hebdo',
      role: 'Guitare',
    });
  });

  it('place les demandes directes puis les présences en attente dans le bloc de réponse', () => {
    const data = buildSessions(input(), now);
    expect(data.pendingResponses.map((response) => response.id)).toEqual([
      'direct-direct',
      'attendance-pending-event',
    ]);
    expect(data.pendingResponses[0]).toMatchObject({
      fee: 180,
      hostName: 'Raphaël',
      instrument: 'Guitare',
      kind: 'direct',
    });
    expect(data.upcoming.find((item) => item.id === 'group-pending-event')).toMatchObject({
      lineupState: 'forming',
      missingRoles: ['Guitare'],
    });
  });

  it('retire seulement les identifiants déjà présentés, jamais une autre date au même horaire', () => {
    const first = sessionItem('first', '2026-09-20T18:00:00.000Z');
    const sameTime = sessionItem('same-time', '2026-09-20T18:00:00.000Z');
    const presentation = sessionsPresentation([first, sameTime], []);
    expect(presentation.featured?.id).toBe('group-first');
    expect(presentation.listed.map((item) => item.id)).toEqual(['group-same-time']);
  });

  it('conserve douze mois joués, retire une indisponibilité et calcule le récapitulatif', () => {
    const data = buildSessions(input(), now);
    expect(data.past.map((item) => item.id)).toEqual(['group-past-event']);
    expect(pastSessionsSummary(data.past)).toEqual({
      dates: 1,
      groups: 1,
      kinds: [{ count: 1, label: 'Répétition' }],
      songs: 1,
    });
  });

  it('ordonne les mois chronologiquement dans le futur et à rebours dans le passé', () => {
    const september = sessionItem('sep', '2026-09-20T18:00:00.000Z');
    const october = sessionItem('oct', '2026-10-02T18:00:00.000Z');
    expect(
      groupSessionsByMonth([october, september], 'upcoming').map((month) => month.key),
    ).toEqual(['2026-09', '2026-10']);
    expect(groupSessionsByMonth([september, october], 'past').map((month) => month.key)).toEqual([
      '2026-10',
      '2026-09',
    ]);
  });
});

describe('mutations Sessions', () => {
  it('construit uniquement les payloads serveur existants', () => {
    expect(attendancePayload('event-1', 'me', 'available')).toEqual({
      event_id: 'event-1',
      profile_id: 'me',
      status: 'available',
    });
    expect(directResponsePayload('gig-1', false)).toEqual({
      p_accept: false,
      p_gig: 'gig-1',
    });
    expect(() => attendancePayload('', 'me', 'available')).toThrow('attendance_response_invalid');
    expect(() => directResponsePayload('', true)).toThrow('direct_response_invalid');
  });
});
