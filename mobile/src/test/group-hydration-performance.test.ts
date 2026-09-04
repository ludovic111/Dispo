import { describe, expect, it, jest } from '@jest/globals';

import { fetchGroups } from '@/features/groups/group-repository';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
const mockedClient = jest.mocked(getSupabaseClient);

export function installGroupFixture(groupCount = 3) {
  const tables: Record<
    | 'music_groups'
    | 'group_members'
    | 'group_events'
    | 'group_docs'
    | 'song_comments'
    | 'group_invitations'
    | 'event_attendance'
    | 'group_message_reactions'
    | 'profiles',
    Record<string, unknown>[]
  > = {
    music_groups: [],
    group_members: [],
    group_events: [],
    group_docs: [],
    song_comments: [],
    group_invitations: [],
    event_attendance: [],
    group_message_reactions: [],
    profiles: [],
  };
  const messages: Record<string, unknown>[] = [];
  const locations: Record<string, unknown>[] = [];
  for (let g = 0; g < groupCount; g++) {
    const id = `group-${g}`;
    tables.music_groups.push({
      id,
      name: id,
      leader_id: 'me',
      repertoire: [],
      emoji: '🎷',
      is_public: false,
      auto_sos_enabled: false,
      auto_sos_min_level: null,
      photo_url: null,
    });
    tables.group_members.push({ group_id: id, profile_id: 'me', kind: 'permanent', role: null });
    tables.group_docs.push({
      id: `doc-${g}`,
      group_id: id,
      added_by: 'me',
      title: 'Chart',
      song_id: null,
    });
    tables.song_comments.push({
      id: `comment-${g}`,
      group_id: id,
      author_id: 'me',
      text: 'Comment',
      song_id: `song-${g}`,
    });
    for (let e = 0; e < 20; e++) {
      const eventId = `${id}-event-${e}`;
      tables.group_events.push({
        id: eventId,
        group_id: id,
        date: `2026-09-${String(e + 1).padStart(2, '0')}T16:00:00Z`,
        title: eventId,
        kind: 'Répétition',
        setlist: [],
        venue: 'Studio',
        recurrence: null,
        reminder_lead_days: 2,
        series_id: null,
      });
      locations.push({ event_id: eventId, exact_address: 'Test local' });
      for (let p = 0; p < 10; p++)
        tables.event_attendance.push({
          event_id: eventId,
          profile_id: `p-${p}`,
          status: 'disponible',
        });
    }
    for (let m = 0; m < 60; m++) {
      const messageId = `${id}-message-${m}`;
      messages.push({
        id: messageId,
        group_id: id,
        sender_id: 'me',
        text: messageId,
        created_at: '2026-09-04T10:00:00Z',
        deleted_at: null,
        edited_at: null,
        attachment_name: null,
        attachment_path: null,
        attachment_size: null,
        attachment_type: null,
      });
      tables.group_message_reactions.push(
        { message_id: messageId, profile_id: 'me', emoji: '😂', removed_at: null },
        { message_id: messageId, profile_id: 'friend', emoji: '😂', removed_at: null },
        {
          message_id: messageId,
          profile_id: 'old',
          emoji: '❤️',
          removed_at: '2026-09-04T10:00:00Z',
        },
      );
    }
  }
  tables.profiles.push({ id: 'me', name: 'Leader', instruments: ['Piano'], photo_url: null });
  function query(data: unknown) {
    const result = { data, error: null };
    const chain = {
      select: () => chain,
      order: () => chain,
      in: () => chain,
      abortSignal: () => chain,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  }
  mockedClient.mockReturnValue({
    from: (name: string) => query(tables[name as keyof typeof tables]),
    rpc: (name: string) => query(name === 'recent_group_messages' ? messages : locations),
  } as never);
}

describe('group hydration at scale', () => {
  it('keeps groups, message reactions and event attendance isolated with stable ordering', async () => {
    installGroupFixture();
    const result = await fetchGroups('me');
    expect(result).toHaveLength(3);
    for (const group of result) {
      expect(group.messages).toHaveLength(60);
      expect(group.events).toHaveLength(20);
      expect(group.documents.map((doc) => doc.id)).toEqual([`doc-${group.id.slice(-1)}`]);
      expect(group.comments.map((comment) => comment.id)).toEqual([
        `comment-${group.id.slice(-1)}`,
      ]);
      expect(group.members[0]).toEqual(
        expect.objectContaining({ id: 'me', name: 'Leader', isLeader: true }),
      );
      expect(group.messages.map((message) => message.id)).toEqual(
        group.messages.map((message) => message.id).toSorted(),
      );
      for (const message of group.messages) {
        expect(message.groupId).toBe(group.id);
        expect(message.reactions).toEqual([{ emoji: '😂', count: 2, reactedByMe: true }]);
      }
      for (const event of group.events) {
        expect(event.groupId).toBe(group.id);
        expect(event.attendance).toHaveLength(10);
        expect(event.privateLocationState).toBe('available');
        expect(event.exactAddress).toBe('Test local');
      }
    }
  });
});
