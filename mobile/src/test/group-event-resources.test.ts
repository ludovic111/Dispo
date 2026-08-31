import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { fetchGig } from '@/features/gigs/gig-repository';
import {
  fetchGroupEventResources,
  groupEventDayKey,
  inviteAvailableToGroupEvent,
  reorderGroupEventSetlist,
} from '@/features/groups/group-event-repository';
import { ensureDirectConversation, sendMessage } from '@/features/messages/message-repository';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/features/gigs/gig-repository', () => ({ fetchGig: jest.fn() }));
jest.mock('@/features/messages/message-repository', () => ({
  ensureDirectConversation: jest.fn(),
  sendMessage: jest.fn(),
}));
jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);
const mockedFetchGig = jest.mocked(fetchGig);
const mockedConversation = jest.mocked(ensureDirectConversation);
const mockedSendMessage = jest.mocked(sendMessage);

function chain(result: unknown) {
  const builder: Record<string, jest.Mock> = {
    abortSignal: jest.fn(() => result),
    contains: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    select: jest.fn(() => builder),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ressources du détail événement', () => {
  it('joint invités, SOS lié et profils disponibles sans réafficher les membres', async () => {
    const gigs = chain({ data: [{ host_id: 'leader', id: 'gig-1' }], error: null });
    const profiles = chain({
      data: [
        {
          available_dates: ['2026-09-12'],
          id: 'member',
          instruments: ['Piano'],
          name: 'Déjà membre',
          photo_url: null,
        },
        {
          available_dates: ['2026-09-12'],
          id: 'candidate',
          instruments: ['Batterie'],
          name: 'Candidate',
          photo_url: null,
        },
      ],
      error: null,
    });
    const guests = chain({
      data: [
        {
          event_id: 'event-1',
          gig_id: 'gig-1',
          group_id: 'group-1',
          instrument: 'Basse',
          musician_id: 'guest',
          name: 'Guest',
          photo_url: null,
        },
      ],
      error: null,
    });
    const client = {
      from: jest.fn((table: string) => (table === 'gig_requests_feed' ? gigs : profiles)),
      rpc: jest.fn(() => guests),
    };
    mockedClient.mockReturnValue(client as unknown as ReturnType<typeof getSupabaseClient>);
    mockedFetchGig.mockResolvedValue({ id: 'gig-1' } as Awaited<ReturnType<typeof fetchGig>>);

    const signal = new AbortController().signal;
    const result = await fetchGroupEventResources({
      eventDate: '2026-09-12T20:00:00.000Z',
      eventId: 'event-1',
      excludedProfileIds: ['member'],
      includeLeaderData: true,
      signal,
      userId: 'leader',
    });

    expect(result.guests.map((guest) => guest.musicianId)).toEqual(['guest']);
    expect(result.availableInvitees.map((profile) => profile.id)).toEqual(['candidate']);
    expect(result.linkedGigs.map((gig) => gig.id)).toEqual(['gig-1']);
    expect(mockedFetchGig).toHaveBeenCalledWith('gig-1', 'leader', signal);
  });

  it('garde l’invitation autoritative si présence ou message échouent', async () => {
    const invitationInsert = jest.fn(async () => ({ error: null }));
    const attendanceUpsert = jest.fn(async () => ({ error: new Error('attendance') }));
    const client = {
      from: jest.fn((table: string) => ({
        insert: table === 'group_invitations' ? invitationInsert : jest.fn(),
        upsert: table === 'event_attendance' ? attendanceUpsert : jest.fn(),
      })),
      functions: { invoke: jest.fn(async () => ({ error: null })) },
    };
    mockedClient.mockReturnValue(client as unknown as ReturnType<typeof getSupabaseClient>);
    mockedConversation.mockRejectedValue(new Error('blocked'));

    const result = await inviteAvailableToGroupEvent({
      eventId: 'event-1',
      groupId: 'group-1',
      invitedBy: 'leader',
      message: 'Viens jouer',
      profileId: 'candidate',
    });

    expect(invitationInsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'guest', profile_id: 'candidate' }),
    );
    expect(result).toEqual({ attendancePrefilled: false, messageSent: false });
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it('utilise le RPC leader dédié pour l’ordre et un jour civil stable', async () => {
    const rpc = jest.fn(async () => ({ error: null }));
    mockedClient.mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabaseClient>);
    await reorderGroupEventSetlist('event-1', ['b', 'a']);
    expect(rpc).toHaveBeenCalledWith('reorder_event_setlist', {
      p_event_id: 'event-1',
      p_song_ids: ['b', 'a'],
    });
    expect(groupEventDayKey('2026-09-12T12:00:00.000Z')).toBe('2026-09-12');
  });
});
