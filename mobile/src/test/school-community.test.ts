import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SchoolCommunity } from '@/features/schools/school-model';
import {
  deleteSchoolMessage,
  editSchoolMessage,
  sendSchoolMessage,
} from '@/features/schools/school-repository';
import { unreadSchoolMessageCount } from '@/features/schools/school-seen-store';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RPC communauté école', () => {
  it('envoie par le RPC protégé puis normalise la réponse', async () => {
    const rpc = jest.fn(async () => ({
      data: {
        channel_id: 'channel-1',
        created_at: '2026-08-31T20:00:00.000Z',
        deleted_at: null,
        edited_at: null,
        id: 'message-1',
        sender_id: 'me',
        text: 'Salut',
      },
      error: null,
    }));
    mockedClient.mockReturnValue({ rpc } as never);

    await expect(
      sendSchoolMessage('channel-1', '  Salut  ', {
        id: 'me',
        name: 'Ludovic',
        photoUrl: 'https://example.test/me.jpg',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        channelId: 'channel-1',
        senderName: 'Ludovic',
        text: 'Salut',
      }),
    );
    expect(rpc).toHaveBeenCalledWith('send_school_message', {
      p_channel_id: 'channel-1',
      p_text: 'Salut',
    });
  });

  it('utilise les RPC auteur-seul pour modifier et supprimer', async () => {
    const rpc = jest.fn(async () => ({ data: undefined, error: null }));
    mockedClient.mockReturnValue({ rpc } as never);

    await editSchoolMessage('message-1', '  Corrigé  ');
    await deleteSchoolMessage('message-1');

    expect(rpc).toHaveBeenNthCalledWith(1, 'edit_school_message', {
      p_message_id: 'message-1',
      p_text: 'Corrigé',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'delete_school_message', {
      p_message_id: 'message-1',
    });
  });
});

describe('non-lus communauté école', () => {
  const community: SchoolCommunity = {
    affiliation: {
      id: 'membership-1',
      isPrimary: true,
      joinedAt: '2026-08-01T10:00:00.000Z',
      memberCount: 12,
      role: 'student',
      roleLabel: null,
      school: {
        city: 'Genève',
        countryCode: 'CH',
        id: 'school-1',
        isVerified: true,
        logoUrl: null,
        name: 'École test',
        shortName: null,
        slug: 'ecole-test',
        websiteUrl: null,
      },
      status: 'active',
      verificationLevel: 'self_declared',
      visibility: 'profile',
    },
    channelId: 'channel-1',
    messages: [
      {
        channelId: 'channel-1',
        createdAt: '2026-08-31T20:01:00.000Z',
        deletedAt: null,
        editedAt: null,
        id: 'received',
        senderId: 'other',
        senderName: 'Nina',
        senderPhotoUrl: null,
        text: 'Salut',
      },
      {
        channelId: 'channel-1',
        createdAt: '2026-08-31T20:02:00.000Z',
        deletedAt: null,
        editedAt: null,
        id: 'mine',
        senderId: 'me',
        senderName: 'Moi',
        senderPhotoUrl: null,
        text: 'Hello',
      },
    ],
  };

  it('compte seulement les messages entrants, non supprimés et postérieurs à la lecture', () => {
    expect(
      unreadSchoolMessageCount(community, 'me', {
        'school-1': '2026-08-31T20:00:00.000Z',
      }),
    ).toBe(1);
    expect(
      unreadSchoolMessageCount(community, 'me', {
        'school-1': '2026-08-31T20:03:00.000Z',
      }),
    ).toBe(0);
  });
});
