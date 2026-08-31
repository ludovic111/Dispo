import {
  attendancePayload,
  buildSessions,
  directResponsePayload,
  type AttendanceStatus,
  type SessionApplicationInput,
  type SessionAttendanceInput,
  type SessionEventInput,
  type SessionGigInput,
  type SessionGroupInput,
  type SessionMemberInput,
  type SessionProfileInput,
  type SessionsData,
} from './session-model';

import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type GroupRow = Database['public']['Tables']['music_groups']['Row'];
type MemberRow = Database['public']['Tables']['group_members']['Row'];
type EventRow = Database['public']['Tables']['group_events']['Row'];
type AttendanceRow = Database['public']['Tables']['event_attendance']['Row'];
type ApplicationRow = Database['public']['Tables']['gig_applications']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type GigFeedRow = Database['public']['Views']['gig_requests_feed']['Row'];

type GroupProjection = Pick<GroupRow, 'emoji' | 'id' | 'name'>;
type MemberProjection = Pick<MemberRow, 'group_id' | 'profile_id' | 'role'>;
type EventProjection = Pick<
  EventRow,
  | 'date'
  | 'group_id'
  | 'id'
  | 'kind'
  | 'public_location_label'
  | 'recurrence'
  | 'reminder_lead_days'
  | 'series_id'
  | 'setlist'
  | 'title'
  | 'venue'
>;
type AttendanceProjection = Pick<AttendanceRow, 'event_id' | 'profile_id' | 'status'>;
type ApplicationProjection = Pick<
  ApplicationRow,
  'gig_id' | 'instrument' | 'musician_id' | 'status'
>;
type ProfileProjection = Pick<ProfileRow, 'id' | 'name'>;
type GigProjection = Pick<
  GigFeedRow,
  | 'date'
  | 'description'
  | 'event_id'
  | 'fee'
  | 'filled_instruments'
  | 'group_id'
  | 'host_id'
  | 'id'
  | 'neighborhood'
  | 'place'
  | 'public_location_label'
  | 'target_id'
  | 'target_status'
  | 'title'
  | 'wanted_instruments'
>;

const groupColumns = 'id,name,emoji' as const;
const memberColumns = 'group_id,profile_id,role' as const;
const eventColumns =
  'id,group_id,kind,title,venue,public_location_label,date,setlist,series_id,recurrence,reminder_lead_days' as const;
const attendanceColumns = 'event_id,profile_id,status' as const;
const applicationColumns = 'gig_id,musician_id,instrument,status' as const;
const gigColumns =
  'id,host_id,title,date,place,public_location_label,neighborhood,description,fee,wanted_instruments,filled_instruments,group_id,event_id,target_id,target_status' as const;

function twelveMonthsAgo(now: Date): string {
  const floor = new Date(now);
  floor.setMonth(floor.getMonth() - 12);
  return floor.toISOString();
}

function validGig(row: GigProjection): row is GigProjection & {
  date: string;
  host_id: string;
  id: string;
  title: string;
} {
  return Boolean(row.date && row.host_id && row.id && row.title);
}

export async function fetchSessions(userId: string, signal?: AbortSignal): Promise<SessionsData> {
  if (!userId) throw new Error('session_user_missing');
  const supabase = getSupabaseClient();
  const now = new Date();

  const groupQuery = supabase.from('music_groups').select(groupColumns).order('created_at', {
    ascending: false,
  });
  const groupResult = await (signal ? groupQuery.abortSignal(signal) : groupQuery);
  if (groupResult.error) throw groupResult.error;
  const groups = groupResult.data as GroupProjection[];
  const groupIds = groups.map((group) => group.id);

  const memberPromise = async (): Promise<MemberProjection[]> => {
    if (groupIds.length === 0) return [];
    const query = supabase.from('group_members').select(memberColumns).in('group_id', groupIds);
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    return result.data as MemberProjection[];
  };
  const eventPromise = async (): Promise<EventProjection[]> => {
    if (groupIds.length === 0) return [];
    const query = supabase
      .from('group_events')
      .select(eventColumns)
      .in('group_id', groupIds)
      .gte('date', twelveMonthsAgo(now))
      .order('date');
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    return result.data as EventProjection[];
  };
  const gigPromise = async (): Promise<GigProjection[]> => {
    const query = supabase.from('gig_requests_feed').select(gigColumns).order('date');
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    return result.data as GigProjection[];
  };
  const applicationPromise = async (): Promise<ApplicationProjection[]> => {
    const query = supabase.from('gig_applications').select(applicationColumns);
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    return result.data as ApplicationProjection[];
  };

  const [members, events, rawGigs, applications] = await Promise.all([
    memberPromise(),
    eventPromise(),
    gigPromise(),
    applicationPromise(),
  ]);
  const gigs = rawGigs.filter(validGig);

  const attendancePromise = async (): Promise<AttendanceProjection[]> => {
    const eventIds = events.map((event) => event.id);
    if (eventIds.length === 0) return [];
    const query = supabase
      .from('event_attendance')
      .select(attendanceColumns)
      .in('event_id', eventIds);
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    return result.data as AttendanceProjection[];
  };
  const profilePromise = async (): Promise<ProfileProjection[]> => {
    const profileIds = [...new Set(gigs.map((gig) => gig.host_id))];
    if (profileIds.length === 0) return [];
    const query = supabase.from('profiles').select('id,name').in('id', profileIds);
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    return result.data as ProfileProjection[];
  };
  const [attendance, profiles] = await Promise.all([attendancePromise(), profilePromise()]);

  const mappedGroups: SessionGroupInput[] = groups.map((group) => ({
    emoji: group.emoji,
    id: group.id,
    name: group.name,
  }));
  const mappedMembers: SessionMemberInput[] = members.map((member) => ({
    groupId: member.group_id,
    profileId: member.profile_id,
    role: member.role,
  }));
  const mappedEvents: SessionEventInput[] = events.map((event) => ({
    date: event.date,
    groupId: event.group_id,
    id: event.id,
    kind: event.kind,
    recurrence: event.recurrence,
    reminderLeadDays: event.reminder_lead_days,
    seriesId: event.series_id,
    setlist: event.setlist,
    title: event.title,
    venue: event.public_location_label || event.venue,
  }));
  const mappedAttendance: SessionAttendanceInput[] = attendance.map((entry) => ({
    eventId: entry.event_id,
    profileId: entry.profile_id,
    status: entry.status,
  }));
  const mappedApplications: SessionApplicationInput[] = applications.map((application) => ({
    gigId: application.gig_id,
    instrument: application.instrument,
    musicianId: application.musician_id,
    status: application.status,
  }));
  const mappedProfiles: SessionProfileInput[] = profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
  }));
  const mappedGigs: SessionGigInput[] = gigs.map((gig) => ({
    date: gig.date,
    description: gig.description ?? '',
    eventId: gig.event_id,
    fee: gig.fee,
    filledInstruments: gig.filled_instruments ?? [],
    groupId: gig.group_id,
    hostId: gig.host_id,
    id: gig.id,
    neighborhood: gig.neighborhood ?? '',
    place: gig.public_location_label || gig.place || '',
    targetId: gig.target_id,
    targetStatus: gig.target_status,
    title: gig.title,
    wantedInstruments: gig.wanted_instruments ?? [],
  }));

  return buildSessions(
    {
      applications: mappedApplications,
      attendance: mappedAttendance,
      events: mappedEvents,
      gigs: mappedGigs,
      groups: mappedGroups,
      members: mappedMembers,
      profiles: mappedProfiles,
      userId,
    },
    now,
  );
}

export async function setSessionAttendance(
  eventId: string,
  profileId: string,
  status: Exclude<AttendanceStatus, 'pending'>,
): Promise<void> {
  const result = await getSupabaseClient()
    .from('event_attendance')
    .upsert(attendancePayload(eventId, profileId, status), {
      onConflict: 'event_id,profile_id',
    });
  if (result.error) throw result.error;
}

export async function respondToDirectSession(gigId: string, accept: boolean): Promise<void> {
  const supabase = getSupabaseClient();
  const result = await supabase.rpc('respond_to_direct_gig', directResponsePayload(gigId, accept));
  if (result.error) throw result.error;
  // Comme le client natif, on déclenche au mieux la livraison de la notification
  // que la RPC vient de mettre en file. Une panne push n'annule jamais la réponse.
  await supabase.functions.invoke('push', { body: { source: 'expo' } }).catch(() => undefined);
}
