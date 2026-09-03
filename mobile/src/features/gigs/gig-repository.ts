import {
  applicationDecisionParams,
  createGigWritePlan,
  directResponseParams,
  matchProfilesToGig,
  resolveGigLocation,
  type GigApplication,
  type GigApplicationStatus,
  type GigCreateInput,
  type GigDetail,
  type GigFormDefaults,
  type GigMatch,
  type GigMatchProfile,
  type GigSummary,
} from './gig-model';

import { pageRange, type Page } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type GigFeedRow = Database['public']['Views']['gig_requests_feed']['Row'];
type GigRow = Database['public']['Tables']['gig_requests']['Row'];
type ApplicationRow = Database['public']['Tables']['gig_applications']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type GigProjection = Pick<
  GigFeedRow,
  | 'date'
  | 'description'
  | 'event_id'
  | 'fee'
  | 'filled_instruments'
  | 'genre'
  | 'group_id'
  | 'host_id'
  | 'id'
  | 'is_locked'
  | 'neighborhood'
  | 'payment_method'
  | 'place'
  | 'posted_at'
  | 'public_location_label'
  | 'target_id'
  | 'target_status'
  | 'title'
  | 'wanted_instruments'
  | 'wanted_levels'
>;
type HostedGigProjection = Pick<
  GigRow,
  | 'date'
  | 'description'
  | 'event_id'
  | 'fee'
  | 'filled_instruments'
  | 'genre'
  | 'group_id'
  | 'host_id'
  | 'id'
  | 'neighborhood'
  | 'payment_method'
  | 'place'
  | 'posted_at'
  | 'public_location_label'
  | 'target_id'
  | 'target_status'
  | 'title'
  | 'wanted_instruments'
  | 'wanted_levels'
>;
type MappableGigProjection = GigProjection | HostedGigProjection;
type ApplicationProjection = Pick<
  ApplicationRow,
  'created_at' | 'id' | 'instrument' | 'message' | 'musician_id' | 'status'
>;
type PendingApplicationProjection = Pick<ApplicationRow, 'gig_id'>;
type ApplicantProfileProjection = Pick<ProfileRow, 'id' | 'name' | 'photo_url'>;
type VisibleSchoolProjection = Pick<
  Database['public']['Tables']['music_school_memberships']['Row'],
  'profile_id' | 'school_id'
>;
type MatchProfileProjection = Pick<
  ProfileRow,
  'available_dates' | 'genres' | 'id' | 'instruments' | 'is_demo' | 'level' | 'name' | 'photo_url'
>;

const gigColumns =
  'id,host_id,title,date,genre,place,public_location_label,neighborhood,wanted_instruments,wanted_levels,filled_instruments,fee,payment_method,description,is_locked,posted_at,group_id,event_id,target_id,target_status' as const;
const hostedGigColumns =
  'id,host_id,title,date,genre,place,public_location_label,neighborhood,wanted_instruments,wanted_levels,filled_instruments,fee,payment_method,description,posted_at,group_id,event_id,target_id,target_status' as const;
const applicationColumns = 'id,musician_id,instrument,message,status,created_at' as const;
const matchProfileColumns =
  'id,name,photo_url,instruments,genres,level,available_dates,is_demo' as const;

function applicationStatus(value: string): GigApplicationStatus {
  if (value === 'accepted' || value === 'declined') return value;
  return 'pending';
}

function directStatus(value: string | null): GigSummary['targetStatus'] {
  if (value === 'accepted' || value === 'declined' || value === 'pending') return value;
  return null;
}

function validGig(row: MappableGigProjection): row is MappableGigProjection & {
  date: string;
  genre: string;
  host_id: string;
  id: string;
  title: string;
} {
  return Boolean(row.date && row.genre && row.host_id && row.id && row.title);
}

async function profileMap(
  profileIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, ApplicantProfileProjection>> {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const query = getSupabaseClient()
    .from('profiles')
    .select('id,name,photo_url')
    .in('id', uniqueIds);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return new Map(
    (result.data as ApplicantProfileProjection[]).map((profile) => [profile.id, profile]),
  );
}

async function visibleSchoolIdsByProfile(
  profileIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const query = getSupabaseClient()
    .from('music_school_memberships')
    .select('profile_id,school_id')
    .in('profile_id', uniqueIds)
    .eq('status', 'active')
    .is('left_at', null);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const schoolsByProfile = new Map<string, string[]>();
  for (const membership of result.data as VisibleSchoolProjection[]) {
    const schools = schoolsByProfile.get(membership.profile_id) ?? [];
    if (!schools.includes(membership.school_id)) schools.push(membership.school_id);
    schoolsByProfile.set(membership.profile_id, schools);
  }
  return schoolsByProfile;
}

async function mapGigs(rows: MappableGigProjection[], signal?: AbortSignal): Promise<GigSummary[]> {
  const validRows = rows.filter(validGig);
  const hostIds = validRows.map((row) => row.host_id);
  const [profiles, schoolsByProfile] = await Promise.all([
    profileMap(hostIds, signal),
    visibleSchoolIdsByProfile(hostIds, signal),
  ]);
  return validRows.map((row) => {
    const host = profiles.get(row.host_id);
    return {
      date: row.date,
      description: row.description,
      eventId: row.event_id,
      fee: row.fee,
      filledInstruments: row.filled_instruments ?? [],
      genre: row.genre,
      groupId: row.group_id,
      hostId: row.host_id,
      hostName: host?.name ?? '',
      hostPhotoUrl: host?.photo_url ?? null,
      hostSchoolIds: schoolsByProfile.get(row.host_id) ?? [],
      id: row.id,
      isFresh: row.posted_at
        ? Date.now() - new Date(row.posted_at).getTime() < 48 * 60 * 60 * 1000
        : false,
      isLocked: 'is_locked' in row && row.is_locked === true,
      neighborhood: row.neighborhood ?? '',
      paymentMethod: row.payment_method,
      place: row.public_location_label || row.place || '',
      postedAt: row.posted_at,
      targetId: row.target_id,
      targetStatus: directStatus(row.target_status),
      title: row.title,
      wantedInstruments: row.wanted_instruments ?? [],
      wantedLevels: row.wanted_levels ?? [],
    };
  });
}

async function pendingApplicationCounts(
  gigIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  if (gigIds.length === 0) return new Map();
  const query = getSupabaseClient()
    .from('gig_applications')
    .select('gig_id')
    .in('gig_id', [...gigIds])
    .eq('status', 'pending');
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const counts = new Map<string, number>();
  for (const application of result.data as PendingApplicationProjection[]) {
    counts.set(application.gig_id, (counts.get(application.gig_id) ?? 0) + 1);
  }
  return counts;
}

function mapApplication(
  row: ApplicationProjection,
  profiles: Map<string, ApplicantProfileProjection>,
): GigApplication {
  const profile = profiles.get(row.musician_id);
  return {
    createdAt: row.created_at,
    id: row.id,
    instrument: row.instrument,
    message: row.message,
    musicianId: row.musician_id,
    musicianName: profile?.name ?? '',
    musicianPhotoUrl: profile?.photo_url ?? null,
    status: applicationStatus(row.status),
  };
}

async function fetchApplications(
  gigId: string,
  musicianId: string,
  isHost: boolean,
  signal?: AbortSignal,
): Promise<{ applicants: GigApplication[]; mine: GigApplication | null }> {
  const supabase = getSupabaseClient();
  const ownQuery = supabase
    .from('gig_applications')
    .select(applicationColumns)
    .eq('gig_id', gigId)
    .eq('musician_id', musicianId);
  const ownResult = await (signal ? ownQuery.abortSignal(signal) : ownQuery).maybeSingle();
  if (ownResult.error) throw ownResult.error;

  let applicantRows: ApplicationProjection[] = [];
  if (isHost) {
    const query = supabase
      .from('gig_applications')
      .select(applicationColumns)
      .eq('gig_id', gigId)
      .order('created_at');
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    applicantRows = result.data as ApplicationProjection[];
  }
  const ownRow = ownResult.data as ApplicationProjection | null;
  const profiles = await profileMap(
    [...applicantRows.map((row) => row.musician_id), ...(ownRow ? [ownRow.musician_id] : [])],
    signal,
  );
  return {
    applicants: applicantRows.map((row) => mapApplication(row, profiles)),
    mine: ownRow ? mapApplication(ownRow, profiles) : null,
  };
}

async function deliverQueuedPush(): Promise<void> {
  await getSupabaseClient()
    .functions.invoke('push', { body: { source: 'expo' } })
    .catch(() => undefined);
}

export async function fetchGigsPage(
  page: number,
  pageSize = 20,
  signal?: AbortSignal,
  hostingUserId?: string,
): Promise<Page<GigSummary>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('gig_requests_feed')
    .select(gigColumns)
    .gte('date', new Date().toISOString())
    .order('date')
    .order('id')
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize) as GigProjection[];
  const mapped = await mapGigs(rows, signal);
  const hostedIds = hostingUserId
    ? mapped.filter((gig) => gig.hostId === hostingUserId).map((gig) => gig.id)
    : [];
  const pendingCounts = await pendingApplicationCounts(hostedIds, signal);
  return {
    items: mapped.map((gig) => ({
      ...gig,
      ...(gig.hostId === hostingUserId
        ? { pendingApplicantCount: pendingCounts.get(gig.id) ?? 0 }
        : {}),
    })),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

/** Reads the owner's active SOS directly from the protected base table.
 * This must never depend on which pages happen to be loaded in the public feed.
 */
export async function fetchHostedGigsPage(
  hostingUserId: string,
  page: number,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<GigSummary>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('gig_requests')
    .select(hostedGigColumns)
    .eq('host_id', hostingUserId)
    .gte('date', new Date().toISOString())
    .order('date')
    .order('id')
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize) as HostedGigProjection[];
  const mapped = await mapGigs(rows, signal);
  const pendingCounts = await pendingApplicationCounts(
    mapped.map((gig) => gig.id),
    signal,
  );
  return {
    items: mapped.map((gig) => ({
      ...gig,
      pendingApplicantCount: pendingCounts.get(gig.id) ?? 0,
    })),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function fetchGig(
  gigId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<GigDetail> {
  const supabase = getSupabaseClient();
  const query = supabase.from('gig_requests_feed').select(gigColumns).eq('id', gigId);
  const result = await (signal ? query.abortSignal(signal) : query).single();
  if (result.error) throw result.error;
  const [gig] = await mapGigs([result.data as GigProjection], signal);
  if (!gig) throw new Error('gig_not_found');

  const [applications, locationResult] = await Promise.all([
    fetchApplications(gigId, userId, gig.hostId === userId, signal),
    supabase.rpc('get_gig_request_location', { p_gig_id: gigId }),
  ]);
  const location = locationResult.error
    ? resolveGigLocation(null, true)
    : resolveGigLocation(
        (locationResult.data?.[0] ?? null) as Parameters<typeof resolveGigLocation>[0],
      );

  return {
    ...gig,
    applicants: applications.applicants,
    location,
    myApplication: applications.mine,
  };
}

export async function fetchGigFormDefaults(
  userId: string,
  signal?: AbortSignal,
): Promise<GigFormDefaults> {
  const query = getSupabaseClient()
    .from('profiles')
    .select('country,postal_code,city,genres,level')
    .eq('id', userId);
  const result = await (signal ? query.abortSignal(signal) : query).single();
  if (result.error) throw result.error;
  return {
    city: result.data.city ?? '',
    countryCode: result.data.country ?? 'CH',
    genres: result.data.genres,
    isProfessional: result.data.level === 'Professionnel',
    postalCode: result.data.postal_code ?? '',
  };
}

export async function createGig(input: GigCreateInput): Promise<string> {
  const supabase = getSupabaseClient();
  const plan = createGigWritePlan(input);
  const result = await supabase.from('gig_requests').insert(plan.insert).select('id').single();
  if (result.error) throw result.error;
  const gigId = result.data.id;
  const locationArgs: Database['public']['Functions']['set_gig_request_location']['Args'] = {
    p_city: plan.location.city,
    p_clear_exact_address: false,
    p_country_code: plan.location.countryCode,
    p_gig_id: gigId,
    p_postal_code: plan.location.postalCode,
    p_public_location_label: plan.location.publicLocationLabel,
    ...(plan.location.exactAddress ? { p_exact_address: plan.location.exactAddress } : {}),
    ...(plan.location.latitude !== null ? { p_latitude: plan.location.latitude } : {}),
    ...(plan.location.longitude !== null ? { p_longitude: plan.location.longitude } : {}),
  };
  const locationResult = await supabase.rpc('set_gig_request_location', locationArgs);
  if (locationResult.error) {
    await supabase
      .from('gig_requests')
      .delete()
      .eq('id', gigId)
      .then(() => undefined);
    throw locationResult.error;
  }
  await deliverQueuedPush();
  return gigId;
}

export async function applyToGig(
  gigId: string,
  musicianId: string,
  instrument: string,
  message: string,
): Promise<void> {
  if (!gigId || !musicianId || !instrument.trim()) throw new Error('gig_application_invalid');
  const result = await getSupabaseClient().from('gig_applications').insert({
    gig_id: gigId,
    instrument: instrument.trim(),
    message: message.trim(),
    musician_id: musicianId,
  });
  if (result.error) throw result.error;
  await deliverQueuedPush();
}

export async function withdrawGigApplication(gigId: string, musicianId: string): Promise<void> {
  const result = await getSupabaseClient()
    .from('gig_applications')
    .delete()
    .eq('gig_id', gigId)
    .eq('musician_id', musicianId);
  if (result.error) throw result.error;
}

export async function decideGigApplication(
  applicationId: string,
  decision: 'accept' | 'decline' | 'reopen',
): Promise<void> {
  const supabase = getSupabaseClient();
  const params = applicationDecisionParams(applicationId);
  const rpc =
    decision === 'accept'
      ? 'accept_gig_application'
      : decision === 'decline'
        ? 'decline_gig_application'
        : 'reopen_gig_application';
  const result = await supabase.rpc(rpc, params);
  if (result.error) throw result.error;
  await deliverQueuedPush();
}

export async function respondToDirectGig(gigId: string, accept: boolean): Promise<void> {
  const result = await getSupabaseClient().rpc(
    'respond_to_direct_gig',
    directResponseParams(gigId, accept),
  );
  if (result.error) throw result.error;
  await deliverQueuedPush();
}

export async function deleteGig(gigId: string): Promise<void> {
  const result = await getSupabaseClient().from('gig_requests').delete().eq('id', gigId);
  if (result.error) throw result.error;
}

export async function fetchGigMatches(
  gigId: string,
  userId: string,
  page = 0,
  pageSize = 50,
  signal?: AbortSignal,
): Promise<Page<GigMatch> & { gig: GigSummary }> {
  const supabase = getSupabaseClient();
  const gigQuery = supabase.from('gig_requests_feed').select(gigColumns).eq('id', gigId);
  const gigResult = await (signal ? gigQuery.abortSignal(signal) : gigQuery).single();
  if (gigResult.error) throw gigResult.error;
  const [gig] = await mapGigs([gigResult.data as GigProjection], signal);
  if (!gig) throw new Error('gig_not_found');

  const { from, to } = pageRange(page, pageSize);
  let profileQuery = supabase
    .from('profiles')
    .select(matchProfileColumns)
    .neq('id', userId)
    .or('is_demo.eq.false,is_showcase.eq.true')
    .neq('name', '')
    .order('name')
    .range(from, to + 1);
  if (gig.wantedInstruments.length > 0) {
    profileQuery = profileQuery.overlaps('instruments', gig.wantedInstruments);
  }
  const profileResult = await (signal ? profileQuery.abortSignal(signal) : profileQuery);
  if (profileResult.error) throw profileResult.error;
  const allRows = profileResult.data as MatchProfileProjection[];
  const rows = allRows.slice(0, pageSize);
  const profileIds = rows.map((row) => row.id);
  const [outgoingResult, incomingResult] =
    profileIds.length === 0
      ? [
          { data: [], error: null },
          { data: [], error: null },
        ]
      : await Promise.all([
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
        ]);
  if (outgoingResult.error) throw outgoingResult.error;
  if (incomingResult.error) throw incomingResult.error;
  const outgoing = new Set(outgoingResult.data.map((follow) => follow.following_id));
  const incoming = new Set(incomingResult.data.map((follow) => follow.follower_id));
  const profiles: GigMatchProfile[] = rows.map((row) => ({
    availableDates: row.available_dates,
    genres: row.genres,
    id: row.id,
    instruments: row.instruments,
    isDemo: row.is_demo,
    level: row.level,
    name: row.name,
    photoUrl: row.photo_url,
    relationRank:
      outgoing.has(row.id) && incoming.has(row.id)
        ? 40
        : outgoing.has(row.id)
          ? 20
          : incoming.has(row.id)
            ? 10
            : 0,
  }));
  return {
    gig,
    items: matchProfilesToGig(gig, profiles),
    nextPage: allRows.length > pageSize ? page + 1 : null,
  };
}
