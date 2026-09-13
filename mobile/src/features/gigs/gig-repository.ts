import {
  applicationDecisionParams,
  createGigWritePlan,
  directResponseParams,
  parseGigCandidate,
  parseGigCandidateProfile,
  parseGigMatch,
  parseGigViewerMatch,
  resolveGigLocation,
  type GigApplication,
  type GigApplicationStatus,
  type GigCandidate,
  type GigCreateInput,
  type GigDetail,
  type GigFormDefaults,
  type GigSummary,
  type GigViewerMatch,
} from './gig-model';

import { pageRange, type Page } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Json, Database } from '@/services/supabase/database.types';

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
  | 'wanted_school_ids'
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
  | 'wanted_school_ids'
>;
type MappableGigProjection = GigProjection | HostedGigProjection;
type ApplicationProjection = Pick<
  ApplicationRow,
  'created_at' | 'id' | 'instrument' | 'message' | 'musician_id' | 'status'
>;
type PendingApplicationProjection = Pick<ApplicationRow, 'gig_id'>;
type ApplicantProfileProjection = Pick<ProfileRow, 'id' | 'is_premium' | 'name' | 'photo_url'>;
type VisibleSchoolProjection = Pick<
  Database['public']['Tables']['music_school_memberships']['Row'],
  'profile_id' | 'school_id'
>;

const gigColumns =
  'id,host_id,title,date,genre,place,public_location_label,neighborhood,wanted_instruments,wanted_levels,wanted_school_ids,filled_instruments,fee,payment_method,description,is_locked,posted_at,group_id,event_id,target_id,target_status' as const;
const hostedGigColumns =
  'id,host_id,title,date,genre,place,public_location_label,neighborhood,wanted_instruments,wanted_levels,wanted_school_ids,filled_instruments,fee,payment_method,description,posted_at,group_id,event_id,target_id,target_status' as const;
const applicationColumns = 'id,musician_id,instrument,message,status,created_at' as const;

interface UntypedRpcResult {
  data: unknown;
  error: { message: string } | null;
}
interface UntypedRpcBuilder extends PromiseLike<UntypedRpcResult> {
  abortSignal(signal: AbortSignal): PromiseLike<UntypedRpcResult>;
}

/** Les RPC de matching 2.5 ne sont pas encore dans les types générés. */
function matchingRpc(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): PromiseLike<UntypedRpcResult> {
  const client = getSupabaseClient() as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => UntypedRpcBuilder;
  };
  const builder = client.rpc(name, args);
  return signal ? builder.abortSignal(signal) : builder;
}

function rpcRows(result: UntypedRpcResult): unknown[] {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

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
    .select('id,name,photo_url,is_premium')
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
      hostIsPremium: host?.is_premium === true,
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
      wantedSchoolIds: row.wanted_school_ids ?? [],
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
    hostContactedAt: null,
    id: row.id,
    instrument: row.instrument,
    message: row.message,
    musicianId: row.musician_id,
    musicianIsPremium: profile?.is_premium === true,
    musicianName: profile?.name ?? '',
    musicianPhotoUrl: profile?.photo_url ?? null,
    status: applicationStatus(row.status),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Candidature enrichie par `gig_applicants` (hôte) : profil + critères de match. */
function mapServerApplicant(value: unknown): GigApplication | null {
  if (!isRecord(value) || !isRecord(value.application)) return null;
  const application = value.application;
  const profile = parseGigCandidateProfile(value.profile);
  if (typeof application.id !== 'string' || typeof application.musician_id !== 'string')
    return null;
  return {
    createdAt: typeof application.created_at === 'string' ? application.created_at : '',
    hostContactedAt:
      typeof application.host_contacted_at === 'string' ? application.host_contacted_at : null,
    id: application.id,
    instrument: typeof application.instrument === 'string' ? application.instrument : null,
    match: parseGigMatch(value.match),
    message: typeof application.message === 'string' ? application.message : '',
    musicianId: application.musician_id,
    musicianIsPremium: profile?.isPremium === true,
    ...(profile?.level ? { musicianLevel: profile.level } : {}),
    musicianName: profile?.name ?? '',
    musicianPhotoUrl: profile?.photoUrl ?? null,
    status: applicationStatus(String(application.status ?? 'pending')),
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

  const applicants = isHost ? await fetchGigApplicants(gigId, signal) : [];
  const ownRow = ownResult.data as ApplicationProjection | null;
  const profiles = await profileMap(ownRow ? [ownRow.musician_id] : [], signal);
  return {
    applicants,
    mine: ownRow ? mapApplication(ownRow, profiles) : null,
  };
}

/** Hôte seulement : chaque candidature avec son profil et ses critères de match. */
export async function fetchGigApplicants(
  gigId: string,
  signal?: AbortSignal,
): Promise<GigApplication[]> {
  const result = await matchingRpc('gig_applicants', { p_gig: gigId }, signal);
  return rpcRows(result)
    .map(mapServerApplicant)
    .filter((applicant): applicant is GigApplication => applicant !== null);
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

export async function fetchGigForEdit(
  gigId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<GigDetail> {
  const query = getSupabaseClient()
    .from('gig_requests')
    .select(hostedGigColumns)
    .eq('id', gigId)
    .eq('host_id', userId);
  const result = await (signal ? query.abortSignal(signal) : query).single();
  if (result.error) throw result.error;
  const [gig] = await mapGigs([result.data as HostedGigProjection], signal);
  if (!gig) throw new Error('gig_not_found');
  const location = await getSupabaseClient().rpc('get_gig_request_location', { p_gig_id: gigId });
  if (location.error) throw location.error;
  return {
    ...gig,
    applicants: [],
    myApplication: null,
    location: resolveGigLocation(location.data?.[0] ?? null),
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

export async function updateGig(
  gigId: string,
  input: GigCreateInput,
  clearExactAddress = false,
): Promise<void> {
  const plan = createGigWritePlan(input, new Date(), true);
  const result = await getSupabaseClient().rpc('update_gig_request', {
    p_gig_id: gigId,
    p_changes: plan.insert as unknown as Json,
    p_location: { ...plan.location, clearExactAddress } as unknown as Json,
  });
  if (result.error) throw result.error;
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

/** Hôte seulement : profils compatibles avec un poste ouvert, triés par score. */
export async function fetchGigCandidates(
  gigId: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<GigCandidate[]> {
  const result = await matchingRpc('gig_candidates', { p_gig: gigId, p_limit: limit }, signal);
  return rpcRows(result)
    .map(parseGigCandidate)
    .filter((candidate): candidate is GigCandidate => candidate !== null);
}

/** Hôte seulement : nombre de profils compatibles, sans scoring (talon vert). */
export async function fetchGigCandidateCount(gigId: string, signal?: AbortSignal): Promise<number> {
  const result = await matchingRpc('gig_candidate_count', { p_gig: gigId }, signal);
  if (result.error) throw result.error;
  return typeof result.data === 'number' ? result.data : 0;
}

/** Annonces du fil où le viewer joue un poste ouvert, avec leur score. */
export async function fetchMyGigMatches(
  limit = 100,
  signal?: AbortSignal,
): Promise<GigViewerMatch[]> {
  const result = await matchingRpc('my_gig_matches', { p_limit: limit }, signal);
  return rpcRows(result)
    .map(parseGigViewerMatch)
    .filter((item): item is GigViewerMatch => item !== null);
}

/** Contact unique : ouvre (ou retrouve) la conversation et envoie le premier message. */
export async function contactGigApplicant(applicationId: string, text: string): Promise<string> {
  const trimmed = text.trim();
  if (!applicationId) throw new Error('gig_application_missing');
  if (trimmed.length < 1 || trimmed.length > 500) throw new Error('message_invalid');
  const result = await matchingRpc('contact_gig_applicant', {
    p_application: applicationId,
    p_text: trimmed,
  });
  if (result.error) throw result.error;
  if (typeof result.data !== 'string' || !result.data) throw new Error('conversation_missing');
  await deliverQueuedPush();
  return result.data;
}

/** Personnes à qui le viewer a déjà envoyé une demande directe encore en attente. */
export async function fetchMyPendingDirectTargets(
  userId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const query = getSupabaseClient()
    .from('gig_requests')
    .select('target_id')
    .eq('host_id', userId)
    .eq('target_status', 'pending')
    .gte('date', new Date().toISOString());
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return [
    ...new Set(
      (result.data as Pick<GigRow, 'target_id'>[])
        .map((row) => row.target_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
}
