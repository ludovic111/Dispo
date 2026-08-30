import { pageRange, type Page } from '@/domain/pagination';
import type { ProfileSummary, SchoolAffiliation } from '@/domain/profile';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type MembershipRow = Database['public']['Tables']['music_school_memberships']['Row'];
type SchoolRow = Database['public']['Tables']['music_schools']['Row'];
type ProfileProjection = Pick<
  ProfileRow,
  | 'available_dates'
  | 'bio'
  | 'city'
  | 'country'
  | 'genres'
  | 'id'
  | 'instruments'
  | 'is_premium'
  | 'level'
  | 'name'
  | 'photo_url'
  | 'rating_avg'
  | 'rating_count'
>;
type AffiliationProjection = Pick<MembershipRow, 'is_primary' | 'profile_id' | 'school_id'>;
type SchoolProjection = Pick<SchoolRow, 'id' | 'logo_url' | 'name' | 'short_name' | 'slug'>;

const profileColumns =
  'id,name,photo_url,bio,instruments,genres,level,available_dates,city,country,rating_avg,rating_count,is_premium' as const;

async function enrichProfiles(
  rows: ProfileProjection[],
  userId: string,
): Promise<ProfileSummary[]> {
  if (rows.length === 0) return [];
  const supabase = getSupabaseClient();
  const profileIds = rows.map((row) => row.id);
  const allProfileIds = [...new Set([userId, ...profileIds])];

  const [outgoingResult, incomingResult, affiliationResult] = await Promise.all([
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .in('following_id', profileIds),
    supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId)
      .in('follower_id', profileIds),
    supabase
      .from('music_school_memberships')
      .select('profile_id,school_id,is_primary')
      .in('profile_id', allProfileIds)
      .eq('status', 'active')
      .is('left_at', null),
  ]);
  if (outgoingResult.error) throw outgoingResult.error;
  if (incomingResult.error) throw incomingResult.error;
  if (affiliationResult.error) throw affiliationResult.error;

  const affiliations = affiliationResult.data as AffiliationProjection[];
  const schoolIds = [...new Set(affiliations.map((membership) => membership.school_id))];
  let schools: SchoolProjection[] = [];
  if (schoolIds.length > 0) {
    const result = await supabase
      .from('music_schools')
      .select('id,slug,name,short_name,logo_url')
      .in('id', schoolIds)
      .eq('is_active', true);
    if (result.error) throw result.error;
    schools = result.data as SchoolProjection[];
  }

  const outgoing = new Set(outgoingResult.data.map((follow) => follow.following_id));
  const incoming = new Set(incomingResult.data.map((follow) => follow.follower_id));
  const schoolById = new Map(schools.map((school) => [school.id, school]));
  const membershipsByProfile = new Map<string, AffiliationProjection[]>();
  for (const membership of affiliations) {
    const current = membershipsByProfile.get(membership.profile_id) ?? [];
    current.push(membership);
    membershipsByProfile.set(membership.profile_id, current);
  }
  const mySchools = new Set(
    (membershipsByProfile.get(userId) ?? []).map((membership) => membership.school_id),
  );

  return rows.map((row) => {
    const profileMemberships = membershipsByProfile.get(row.id) ?? [];
    const profileSchools = profileMemberships
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((membership): SchoolAffiliation | null => {
        const school = schoolById.get(membership.school_id);
        return school
          ? {
              id: school.id,
              logoUrl: school.logo_url,
              name: school.name,
              shortName: school.short_name,
              slug: school.slug,
            }
          : null;
      })
      .filter((school): school is SchoolAffiliation => school !== null);

    return {
      availableDates: row.available_dates,
      bio: row.bio,
      city: row.city,
      country: row.country,
      genres: row.genres,
      id: row.id,
      instruments: row.instruments,
      isFriend: outgoing.has(row.id) && incoming.has(row.id),
      isPremium: row.is_premium,
      level: row.level,
      name: row.name,
      photoUrl: row.photo_url,
      ratingAverage: row.rating_avg,
      ratingCount: row.rating_count,
      schools: profileSchools,
      sharesSchool: profileMemberships.some((membership) => mySchools.has(membership.school_id)),
    };
  });
}

export async function fetchProfilesPage(
  userId: string,
  page: number,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<ProfileSummary>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('profiles')
    .select(profileColumns)
    .neq('id', userId)
    .eq('is_demo', false)
    .neq('name', '')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize) as ProfileProjection[];
  return {
    items: await enrichProfiles(rows, userId),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function fetchProfile(
  profileId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<ProfileSummary> {
  const query = getSupabaseClient().from('profiles').select(profileColumns).eq('id', profileId);
  const result = await (signal ? query.abortSignal(signal) : query).single();
  if (result.error) throw result.error;
  const [profile] = await enrichProfiles([result.data as ProfileProjection], userId);
  if (!profile) throw new Error('profile_not_found');
  return profile;
}
