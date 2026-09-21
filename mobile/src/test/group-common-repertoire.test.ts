import { describe, expect, it, jest } from '@jest/globals';

import { initialGroupRepertoire } from '@/features/groups/group-common-repertoire';
import { createGroup } from '@/features/groups/group-repository';
import { createWorkshopGroup } from '@/features/premium/workshop-groups';
import { setProfileCollaboration } from '@/features/profiles/profile-social-repository';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
const client = jest.mocked(getSupabaseClient);

it('declares a collaboration idempotently without requiring UPDATE permission', async () => {
  const upsert = jest.fn(async () => ({ error: null }));
  client.mockReturnValue({ from: () => ({ upsert }) } as never);
  await setProfileCollaboration('b', 'a', true);
  expect(upsert).toHaveBeenCalledWith(
    { a_id: 'a', b_id: 'b' },
    {
      onConflict: 'a_id,b_id',
      ignoreDuplicates: true,
    },
  );
});

describe('common group repertoire', () => {
  it.each(['regular', 'workshop'])(
    'seeds a %s group and keeps invitations explicit',
    async (kind) => {
      const rpc = jest.fn(async () => ({
        data: {
          songs: [{ title: 'Blue Bossa', artist: 'Kenny Dorham', catalog_id: 'apple:42' }],
          unavailable_count: 0,
        },
        error: null,
      }));
      const insert = jest.fn(async () => ({ error: null }));
      const from = jest.fn(() => ({ insert }));
      client.mockReturnValue({ rpc, from } as never);
      const input = {
        name: 'Quartet',
        emoji: '🎷',
        memberIds: ['b', 'b'],
        withCommonRepertoire: true,
      };
      if (kind === 'regular') await createGroup('a', input);
      else await createWorkshopGroup('a', { ...input, schoolId: 'school' });
      expect(rpc).toHaveBeenCalledWith('group_common_repertoire', { p_profiles: ['b'] });
      expect(insert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          repertoire: [
            expect.objectContaining({
              title: 'Blue Bossa',
              catalog_id: 'apple:42',
              is_approved: true,
              suggested_by: 'a',
            }),
          ],
        }),
      );
      expect(insert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ profile_id: 'b', kind: 'permanent' }),
      );
      expect(from).not.toHaveBeenCalledWith('group_members');
    },
  );

  it('rechecks privacy before creating a group and leaves no partial group on failure', async () => {
    const insert = jest.fn();
    client.mockReturnValue({
      rpc: async () => ({ data: { songs: [], unavailable_count: 1 }, error: null }),
      from: () => ({ insert }),
    } as never);
    await expect(
      createGroup('a', { name: 'Test', emoji: '🎶', memberIds: ['b'], withCommonRepertoire: true }),
    ).rejects.toThrow('group_repertoire_private');
    expect(insert).not.toHaveBeenCalled();
  });

  it('allows an empty intersection without inventing songs', async () => {
    client.mockReturnValue({
      rpc: async () => ({ data: { songs: [], unavailable_count: 0 }, error: null }),
    } as never);
    await expect(initialGroupRepertoire(['b'], 'a')).resolves.toEqual([]);
  });
});
