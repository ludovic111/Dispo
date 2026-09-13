import { randomUUID } from 'expo-crypto';

import type { WorkshopSchool } from './subscription-service';

import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

// `school_id` lands with migration 20260913152000; regenerate database.types.ts
// after applying it and drop this assertion.
type MusicGroupInsert = Database['public']['Tables']['music_groups']['Insert'] & {
  school_id?: string | null;
};

export interface WorkshopGroupInput {
  emoji: string;
  memberIds: string[];
  name: string;
  schoolId: string;
}

export interface WorkshopGroupResult {
  failedInvitationCount: number;
  groupId: string;
}

/** The workshop school selected on the creation screen, or none when ineligible. */
export function selectedWorkshopSchool(
  schools: readonly WorkshopSchool[],
  schoolId: string | null,
): WorkshopSchool | null {
  if (!schoolId) return null;
  return schools.find((school) => school.schoolId === schoolId) ?? null;
}

/**
 * Mirrors the regular group creation but tags the group with `school_id`: the
 * server policy then admits any tier with an active membership in that school,
 * and the group never counts toward the paid quota.
 */
export async function createWorkshopGroup(
  userId: string,
  input: WorkshopGroupInput,
): Promise<WorkshopGroupResult> {
  const name = input.name.trim();
  const memberIds = [...new Set(input.memberIds)].filter((id) => id !== userId);
  if (!userId) throw new Error('group_auth_required');
  if (!name || memberIds.length === 0 || !input.schoolId) throw new Error('group_invalid');
  const supabase = getSupabaseClient();
  const groupId = randomUUID().toLowerCase();
  const payload: MusicGroupInsert = {
    emoji: input.emoji || '🎶',
    id: groupId,
    leader_id: userId,
    name,
    school_id: input.schoolId,
  };
  const created = await supabase
    .from('music_groups')
    .insert(payload as Database['public']['Tables']['music_groups']['Insert']);
  if (created.error) throw created.error;
  const invitations = await Promise.all(
    memberIds.map(async (profileId) => {
      const invited = await supabase.from('group_invitations').insert({
        group_id: groupId,
        invited_by: userId,
        kind: 'permanent',
        profile_id: profileId,
      });
      return invited.error;
    }),
  );
  return { failedInvitationCount: invitations.filter(Boolean).length, groupId };
}
