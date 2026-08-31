import type { Page } from '@/domain/pagination';
import { pageRange } from '@/domain/pagination';
import {
  canonicalCollaborationPair,
  clampProfileRating,
  type ProfileConnection,
  type ProfilePublicGroup,
  type ProfileSocialState,
} from '@/features/profiles/profile-social-model';
import { getSupabaseClient } from '@/services/supabase/client';

const connectionColumns = 'id,name,photo_url,instruments,level,is_demo' as const;

function connection(profile: {
  id: string;
  instruments: string[];
  is_demo: boolean;
  level: string;
  name: string;
  photo_url: string | null;
}): ProfileConnection {
  return {
    id: profile.id,
    instruments: profile.instruments,
    isDemo: profile.is_demo,
    level: profile.level,
    name: profile.name,
    photoUrl: profile.photo_url,
  };
}

async function fetchConnections(ids: string[], signal?: AbortSignal): Promise<ProfileConnection[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const query = getSupabaseClient().from('profiles').select(connectionColumns).in('id', unique);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const byId = new Map(result.data.map((profile) => [profile.id, connection(profile)]));
  return unique.flatMap((id) => {
    const profile = byId.get(id);
    return profile ? [profile] : [];
  });
}

export async function fetchProfileSocialState(
  profileId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<ProfileSocialState> {
  const supabase = getSupabaseClient();
  const pair = canonicalCollaborationPair(profileId, userId);
  const ratingQuery = supabase
    .from('ratings')
    .select('stars')
    .eq('rater_id', userId)
    .eq('rated_id', profileId);
  const collaborationQuery = supabase
    .from('collaborations')
    .select('a_id')
    .eq('a_id', pair.a_id)
    .eq('b_id', pair.b_id);
  const groupsQuery = supabase.rpc('profile_public_groups', { target: profileId });
  const [rating, collaboration, groups] = await Promise.all([
    (signal ? ratingQuery.abortSignal(signal) : ratingQuery).maybeSingle(),
    (signal ? collaborationQuery.abortSignal(signal) : collaborationQuery).maybeSingle(),
    signal ? groupsQuery.abortSignal(signal) : groupsQuery,
  ]);
  if (rating.error) throw rating.error;
  if (collaboration.error) throw collaboration.error;
  if (groups.error) throw groups.error;
  const publicGroups: ProfilePublicGroup[] = groups.data.map((group) => ({
    emoji: group.emoji,
    id: group.id,
    isLeader: group.is_leader,
    memberCount: group.member_count,
    name: group.name,
    photoUrl: group.photo_url,
  }));
  return {
    hasPlayedWith: collaboration.data !== null,
    myRating: rating.data?.stars ?? null,
    publicGroups,
  };
}

export async function fetchProfileFollowersPage(
  profileId: string,
  page: number,
  pageSize = 30,
  signal?: AbortSignal,
): Promise<Page<ProfileConnection>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('follows')
    .select('follower_id,created_at')
    .eq('following_id', profileId)
    .order('created_at', { ascending: false })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize);
  return {
    items: await fetchConnections(
      rows.map((row) => row.follower_id),
      signal,
    ),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function fetchProfileCollaborators(
  profileId: string,
  signal?: AbortSignal,
): Promise<ProfileConnection[]> {
  const supabase = getSupabaseClient();
  const firstQuery = supabase
    .from('collaborations')
    .select('b_id,created_at')
    .eq('a_id', profileId)
    .order('created_at', { ascending: false })
    .limit(500);
  const secondQuery = supabase
    .from('collaborations')
    .select('a_id,created_at')
    .eq('b_id', profileId)
    .order('created_at', { ascending: false })
    .limit(500);
  const [first, second] = await Promise.all([
    signal ? firstQuery.abortSignal(signal) : firstQuery,
    signal ? secondQuery.abortSignal(signal) : secondQuery,
  ]);
  if (first.error) throw first.error;
  if (second.error) throw second.error;
  const ids = [...first.data.map((edge) => edge.b_id), ...second.data.map((edge) => edge.a_id)];
  const profiles = await fetchConnections(ids, signal);
  return profiles.sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

export async function setProfileFollowing(
  userId: string,
  profileId: string,
  following: boolean,
): Promise<void> {
  if (userId === profileId) throw new Error('profile_follow_self');
  const table = getSupabaseClient().from('follows');
  const result = following
    ? await table.insert({ follower_id: userId, following_id: profileId })
    : await table.delete().eq('follower_id', userId).eq('following_id', profileId);
  if (result.error) throw result.error;
}

export async function setProfileCollaboration(
  userId: string,
  profileId: string,
  played: boolean,
): Promise<void> {
  const pair = canonicalCollaborationPair(userId, profileId);
  const table = getSupabaseClient().from('collaborations');
  if (!played) {
    const rating = await getSupabaseClient()
      .from('ratings')
      .delete()
      .eq('rater_id', userId)
      .eq('rated_id', profileId);
    if (rating.error) throw rating.error;
  }
  const result = played
    ? await table.upsert(pair)
    : await table.delete().eq('a_id', pair.a_id).eq('b_id', pair.b_id);
  if (result.error) throw result.error;
}

export async function setProfileRating(
  userId: string,
  profileId: string,
  stars: number | null,
): Promise<void> {
  const table = getSupabaseClient().from('ratings');
  const result =
    stars === null
      ? await table.delete().eq('rater_id', userId).eq('rated_id', profileId)
      : await table.upsert({
          rated_id: profileId,
          rater_id: userId,
          stars: clampProfileRating(stars),
        });
  if (result.error) throw result.error;
}

export async function reportProfile(
  userId: string,
  profileId: string,
  reason: string,
): Promise<void> {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) throw new Error('profile_report_reason_missing');
  const result = await getSupabaseClient().from('reports').insert({
    reason: cleanReason,
    reported_id: profileId,
    reporter_id: userId,
  });
  if (result.error) throw result.error;
}

export async function blockProfile(userId: string, profileId: string): Promise<void> {
  if (userId === profileId) throw new Error('profile_block_self');
  const result = await getSupabaseClient()
    .from('blocks')
    .upsert({ blocked_id: profileId, blocker_id: userId });
  if (result.error) throw result.error;
}
