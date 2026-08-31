import { pageRange, type Page } from '@/domain/pagination';
import type {
  ProfileDemoVideo,
  ProfileAvailabilityPlace,
  ProfileSocials,
  ProfileSummary,
  SchoolAffiliation,
} from '@/domain/profile';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type MembershipRow = Database['public']['Tables']['music_school_memberships']['Row'];
type SchoolRow = Database['public']['Tables']['music_schools']['Row'];
type ProfileProjection = Pick<
  ProfileRow,
  | 'age'
  | 'available_dates'
  | 'availability_places'
  | 'bio'
  | 'city'
  | 'country'
  | 'genres'
  | 'id'
  | 'demo_videos'
  | 'instrument_levels'
  | 'instruments'
  | 'is_premium'
  | 'is_demo'
  | 'is_showcase'
  | 'latitude'
  | 'level'
  | 'longitude'
  | 'location_precision'
  | 'name'
  | 'neighborhood'
  | 'photo_url'
  | 'postal_code'
  | 'rating_avg'
  | 'rating_count'
  | 'repertoire'
  | 'socials'
>;
type AffiliationProjection = Pick<MembershipRow, 'is_primary' | 'profile_id' | 'school_id'>;
type SchoolProjection = Pick<SchoolRow, 'id' | 'logo_url' | 'name' | 'short_name' | 'slug'>;

const profileColumns =
  'id,name,age,photo_url,bio,instruments,instrument_levels,genres,level,available_dates,availability_places,city,country,postal_code,neighborhood,latitude,longitude,location_precision,rating_avg,rating_count,is_premium,is_demo,is_showcase,repertoire,socials,demo_videos' as const;

function profileAvailabilityPlaces(
  value: ProfileRow['availability_places'],
): ProfileAvailabilityPlace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ProfileAvailabilityPlace[] => {
    if (!item || Array.isArray(item) || typeof item !== 'object') return [];
    const id = typeof item.id === 'string' ? item.id : '';
    const from = typeof item.from === 'string' ? item.from : '';
    const to = typeof item.to === 'string' ? item.to : '';
    const city = typeof item.city === 'string' ? item.city.trim() : '';
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return [];
    }
    if (!city || from > to) return [];
    return [
      {
        city,
        country:
          typeof item.country === 'string' && item.country.trim()
            ? item.country.trim().toUpperCase()
            : null,
        from,
        id,
        postalCode:
          typeof item.postal_code === 'string' && item.postal_code.trim()
            ? item.postal_code.trim().toUpperCase()
            : null,
        to,
      },
    ];
  });
}

function profileSocials(value: ProfileRow['socials']): ProfileSocials {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  const networks = new Set(['instagram', 'tiktok', 'youtube', 'x']);
  return Object.fromEntries(
    Object.entries(value).flatMap(([network, handle]) =>
      networks.has(network) && typeof handle === 'string' && handle.trim()
        ? [[network, handle.trim()]]
        : [],
    ),
  ) as ProfileSocials;
}

function profileDemoVideos(value: ProfileRow['demo_videos']): ProfileDemoVideo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ProfileDemoVideo[] => {
    if (!item || Array.isArray(item) || typeof item !== 'object') return [];
    const id = typeof item.id === 'string' ? item.id : '';
    const path = typeof item.path === 'string' ? item.path : '';
    const url = typeof item.url === 'string' ? item.url : '';
    if (!id || !url.startsWith('https://')) return [];
    return [
      {
        date: typeof item.date === 'string' ? item.date : null,
        id,
        path,
        thumbUrl:
          typeof item.thumb === 'string' && item.thumb.startsWith('https://') ? item.thumb : null,
        title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null,
        url,
      },
    ];
  });
}

async function enrichProfiles(
  rows: ProfileProjection[],
  userId: string,
): Promise<ProfileSummary[]> {
  if (rows.length === 0) return [];
  const supabase = getSupabaseClient();
  const profileIds = rows.map((row) => row.id);
  const allProfileIds = [...new Set([userId, ...profileIds])];

  const [
    outgoingResult,
    incomingResult,
    affiliationResult,
    followerResult,
    collaborationAsFirst,
    collaborationAsSecond,
  ] = await Promise.all([
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
    supabase.from('follows').select('following_id').in('following_id', profileIds),
    supabase.from('collaborations').select('a_id').in('a_id', profileIds),
    supabase.from('collaborations').select('b_id').in('b_id', profileIds),
  ]);
  if (outgoingResult.error) throw outgoingResult.error;
  if (incomingResult.error) throw incomingResult.error;
  if (affiliationResult.error) throw affiliationResult.error;
  if (followerResult.error) throw followerResult.error;
  if (collaborationAsFirst.error) throw collaborationAsFirst.error;
  if (collaborationAsSecond.error) throw collaborationAsSecond.error;

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
  const friends = new Set(profileIds.filter((id) => outgoing.has(id) && incoming.has(id)));
  const playedWithFriend = new Set<string>();
  if (friends.size > 0) {
    const friendIds = [...friends];
    const [asFirst, asSecond] = await Promise.all([
      supabase.from('collaborations').select('a_id,b_id').in('a_id', friendIds),
      supabase.from('collaborations').select('a_id,b_id').in('b_id', friendIds),
    ]);
    if (asFirst.error) throw asFirst.error;
    if (asSecond.error) throw asSecond.error;
    for (const collaboration of [...asFirst.data, ...asSecond.data]) {
      if (friends.has(collaboration.a_id)) playedWithFriend.add(collaboration.b_id);
      if (friends.has(collaboration.b_id)) playedWithFriend.add(collaboration.a_id);
    }
  }
  const followerCounts = new Map<string, number>();
  for (const follow of followerResult.data) {
    followerCounts.set(follow.following_id, (followerCounts.get(follow.following_id) ?? 0) + 1);
  }
  const collaborationCounts = new Map<string, number>();
  for (const collaboration of collaborationAsFirst.data) {
    collaborationCounts.set(
      collaboration.a_id,
      (collaborationCounts.get(collaboration.a_id) ?? 0) + 1,
    );
  }
  for (const collaboration of collaborationAsSecond.data) {
    collaborationCounts.set(
      collaboration.b_id,
      (collaborationCounts.get(collaboration.b_id) ?? 0) + 1,
    );
  }
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
      age: row.age,
      availableDates: row.available_dates,
      availabilityPlaces: profileAvailabilityPlaces(row.availability_places),
      bio: row.bio,
      city: row.city,
      collaborationCount: collaborationCounts.get(row.id) ?? 0,
      country: row.country,
      genres: row.genres,
      id: row.id,
      demoVideos: profileDemoVideos(row.demo_videos),
      instrumentLevels:
        row.instrument_levels &&
        !Array.isArray(row.instrument_levels) &&
        typeof row.instrument_levels === 'object'
          ? Object.fromEntries(
              Object.entries(row.instrument_levels).flatMap(([instrument, level]) =>
                typeof level === 'string' ? [[instrument, level]] : [],
              ),
            )
          : {},
      instruments: row.instruments,
      isDemo: row.is_demo,
      isFriend: outgoing.has(row.id) && incoming.has(row.id),
      isPremium: row.is_premium,
      latitude: row.latitude,
      level: row.level,
      longitude: row.longitude,
      locationPrecision: row.location_precision,
      name: row.name,
      neighborhood: row.neighborhood,
      photoUrl: row.photo_url,
      playedWithFriend: playedWithFriend.has(row.id),
      postalCode: row.postal_code,
      ratingAverage: row.rating_avg,
      ratingCount: row.rating_count,
      repertoire: row.repertoire,
      relationship:
        outgoing.has(row.id) && incoming.has(row.id)
          ? 'friend'
          : outgoing.has(row.id)
            ? 'following'
            : incoming.has(row.id)
              ? 'follower'
              : 'none',
      schools: profileSchools,
      sharesSchool: profileMemberships.some((membership) => mySchools.has(membership.school_id)),
      socials: profileSocials(row.socials),
      followerCount: followerCounts.get(row.id) ?? 0,
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
    .or('is_demo.eq.false,is_showcase.eq.true')
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
