export type AttendanceStatus = 'available' | 'pending' | 'unavailable';
export type LineupState = 'complete' | 'forming' | 'late';
export type SessionSource = 'applied' | 'group' | 'hosting' | 'playing';
export type SessionsScope = 'past' | 'upcoming';

export interface SessionGroupInput {
  emoji: string;
  id: string;
  name: string;
}

export interface SessionMemberInput {
  groupId: string;
  profileId: string;
  role: string | null;
}

export interface SessionEventInput {
  date: string;
  groupId: string;
  id: string;
  kind: string;
  recurrence: string | null;
  reminderLeadDays: number | null;
  seriesId: string | null;
  setlist: unknown;
  title: string;
  venue: string;
}

export interface SessionAttendanceInput {
  eventId: string;
  profileId: string;
  status: string;
}

export interface SessionGigInput {
  date: string;
  description: string;
  eventId: string | null;
  fee: number | null;
  filledInstruments: string[];
  groupId: string | null;
  hostId: string;
  id: string;
  neighborhood: string;
  place: string;
  targetId: string | null;
  targetStatus: string | null;
  title: string;
  wantedInstruments: string[];
}

export interface SessionApplicationInput {
  gigId: string;
  instrument: string | null;
  musicianId: string;
  status: string;
}

export interface SessionProfileInput {
  id: string;
  name: string;
}

export interface BuildSessionsInput {
  applications: SessionApplicationInput[];
  attendance: SessionAttendanceInput[];
  events: SessionEventInput[];
  gigs: SessionGigInput[];
  groups: SessionGroupInput[];
  members: SessionMemberInput[];
  profiles: SessionProfileInput[];
  userId: string;
}

export interface SessionItem {
  approvedSongCount: number;
  attendanceStatus: AttendanceStatus | null;
  availableCount: number;
  confirmDeadline: string | null;
  date: string;
  eventId: string | null;
  eventKind: string | null;
  gigId: string | null;
  groupEmoji: string | null;
  groupId: string | null;
  groupName: string | null;
  hostName: string | null;
  id: string;
  instrument: string | null;
  isFilled: boolean;
  lineupState: LineupState | null;
  missingRoles: string[];
  pendingApplicantCount: number;
  place: string;
  presentCount: number;
  recurrenceLabel: string | null;
  role: string | null;
  rosterCount: number;
  source: SessionSource;
  title: string;
}

export interface GroupPendingResponse {
  confirmDeadline: string;
  date: string;
  eventId: string;
  groupEmoji: string;
  groupId: string;
  groupName: string;
  id: string;
  kind: 'group';
  place: string;
  sessionId: string;
  title: string;
}

export interface DirectPendingResponse {
  date: string;
  description: string;
  fee: number | null;
  gigId: string;
  hostName: string;
  id: string;
  instrument: string | null;
  kind: 'direct';
  place: string;
  title: string;
}

export type PendingSessionResponse = DirectPendingResponse | GroupPendingResponse;

export interface SessionsData {
  past: SessionItem[];
  pendingResponses: PendingSessionResponse[];
  upcoming: SessionItem[];
}

export interface SessionsPresentation {
  featured: SessionItem | null;
  listed: SessionItem[];
}

export interface SessionMonth {
  key: string;
  sessions: SessionItem[];
}

export interface PastSessionsSummary {
  dates: number;
  groups: number;
  kinds: { count: number; label: string }[];
  songs: number;
}

export function sessionDestination(
  item: Pick<SessionItem, 'eventId' | 'gigId' | 'groupId'>,
): `/gigs/${string}` | `/groups/${string}/events/${string}` | null {
  if (item.groupId && item.eventId) {
    return `/groups/${item.groupId}/events/${item.eventId}`;
  }
  return item.gigId ? `/gigs/${item.gigId}` : null;
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAttendance(value: string | undefined): AttendanceStatus {
  if (value === 'available' || value === 'unavailable') return value;
  return 'pending';
}

function approvedSongCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter(
    (song) =>
      typeof song === 'object' &&
      song !== null &&
      'is_approved' in song &&
      song.is_approved === true,
  ).length;
}

function recurrenceLabel(seriesId: string | null, recurrence: string | null): string | null {
  if (!seriesId || !recurrence || recurrence === 'Ponctuel') return null;
  switch (recurrence) {
    case 'Chaque semaine':
      return 'Hebdo';
    case 'Toutes les 2 semaines':
      return '2 sem.';
    case 'Chaque mois':
      return 'Mensuel';
    default:
      return recurrence;
  }
}

function gigPlace(gig: SessionGigInput): string {
  return [gig.place.trim(), gig.neighborhood.trim()]
    .filter((part, index, parts) => part.length > 0 && parts.indexOf(part) === index)
    .join(' · ');
}

function eventDeadline(event: SessionEventInput): string {
  const date = validDate(event.date);
  if (!date) return event.date;
  const leadDays = Math.min(Math.max(event.reminderLeadDays ?? 2, 0), 60);
  return new Date(date.getTime() - leadDays * 86_400_000).toISOString();
}

function sessionMonthKey(value: string): string {
  const date = validDate(value);
  if (!date) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function addMonths(value: Date, months: number): Date {
  const result = new Date(value);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function buildSessions(input: BuildSessionsInput, now = new Date()): SessionsData {
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const profileNameById = new Map(input.profiles.map((profile) => [profile.id, profile.name]));
  const membersByGroup = new Map<string, SessionMemberInput[]>();
  for (const member of input.members) {
    const members = membersByGroup.get(member.groupId) ?? [];
    members.push(member);
    membersByGroup.set(member.groupId, members);
  }

  const attendanceByEventAndProfile = new Map(
    input.attendance.map((entry) => [`${entry.eventId}:${entry.profileId}`, entry.status]),
  );
  const gigsByEvent = new Map<string, SessionGigInput[]>();
  for (const gig of input.gigs) {
    if (!gig.eventId) continue;
    const gigs = gigsByEvent.get(gig.eventId) ?? [];
    gigs.push(gig);
    gigsByEvent.set(gig.eventId, gigs);
  }

  const validEvents = input.events
    .map((event) => ({ date: validDate(event.date), event }))
    .filter((entry): entry is { date: Date; event: SessionEventInput } => entry.date !== null)
    .filter(({ event }) => groupById.has(event.groupId));
  const visibleUpcomingEventIds = new Set(
    validEvents.filter(({ date }) => date > now).map(({ event }) => event.id),
  );
  const floor = addMonths(now, -12);
  const upcoming: SessionItem[] = [];
  const past: SessionItem[] = [];
  const groupPending: GroupPendingResponse[] = [];

  for (const { date, event } of validEvents) {
    const group = groupById.get(event.groupId);
    if (!group) continue;
    const members = membersByGroup.get(group.id) ?? [];
    const currentMember = members.find((member) => member.profileId === input.userId);
    const statusFor = (profileId: string) =>
      normalizeAttendance(attendanceByEventAndProfile.get(`${event.id}:${profileId}`));
    const myStatus = currentMember ? statusFor(input.userId) : 'pending';
    const availableMembers = members.filter(
      (member) => statusFor(member.profileId) === 'available',
    );
    const roles = new Set(
      members.map((member) => member.role?.trim()).filter((role): role is string => Boolean(role)),
    );
    const availableRoles = new Set(
      availableMembers
        .map((member) => member.role?.trim())
        .filter((role): role is string => Boolean(role)),
    );
    const replacements = new Set(
      (gigsByEvent.get(event.id) ?? []).flatMap((gig) => gig.filledInstruments),
    );
    const missingRoles = [...roles]
      .filter((role) => !availableRoles.has(role) && !replacements.has(role))
      .sort((left, right) => left.localeCompare(right));
    const complete =
      roles.size === 0
        ? members.length > 0 && availableMembers.length === members.length
        : missingRoles.length === 0;
    const deadline = eventDeadline(event);
    const lineupState: LineupState = complete
      ? 'complete'
      : new Date(deadline) <= now
        ? 'late'
        : 'forming';
    const item: SessionItem = {
      approvedSongCount: approvedSongCount(event.setlist),
      attendanceStatus: myStatus,
      availableCount: availableMembers.length,
      confirmDeadline: deadline,
      date: event.date,
      eventId: event.id,
      eventKind: event.kind,
      gigId: null,
      groupEmoji: group.emoji,
      groupId: group.id,
      groupName: group.name,
      hostName: null,
      id: `group-${event.id}`,
      instrument: null,
      isFilled: complete,
      lineupState,
      missingRoles,
      pendingApplicantCount: 0,
      place: event.venue,
      presentCount: availableMembers.length,
      recurrenceLabel: recurrenceLabel(event.seriesId, event.recurrence),
      role: currentMember?.role?.trim() || null,
      rosterCount: members.length,
      source: 'group',
      title: event.title,
    };
    if (date > now) {
      upcoming.push(item);
      if (currentMember && myStatus === 'pending') {
        groupPending.push({
          confirmDeadline: deadline,
          date: event.date,
          eventId: event.id,
          groupEmoji: group.emoji,
          groupId: group.id,
          groupName: group.name,
          id: `attendance-${event.id}`,
          kind: 'group',
          place: event.venue,
          sessionId: item.id,
          title: event.title,
        });
      }
    } else if (date >= floor && myStatus !== 'unavailable') {
      past.push(item);
    }
  }

  const applicationsByGig = new Map<string, SessionApplicationInput[]>();
  for (const application of input.applications) {
    const applications = applicationsByGig.get(application.gigId) ?? [];
    applications.push(application);
    applicationsByGig.set(application.gigId, applications);
  }

  const directPending: DirectPendingResponse[] = [];
  for (const gig of input.gigs) {
    const date = validDate(gig.date);
    if (!date || date <= now) continue;
    const linkedEventIsVisible = gig.eventId ? visibleUpcomingEventIds.has(gig.eventId) : false;
    const isMine = gig.hostId === input.userId;
    const isDirect = gig.targetId !== null;
    const myApplication = (applicationsByGig.get(gig.id) ?? []).find(
      (application) => application.musicianId === input.userId,
    );

    if (
      isDirect &&
      !isMine &&
      gig.targetId === input.userId &&
      gig.targetStatus === 'pending' &&
      !linkedEventIsVisible
    ) {
      directPending.push({
        date: gig.date,
        description: gig.description,
        fee: gig.fee,
        gigId: gig.id,
        hostName: profileNameById.get(gig.hostId) ?? '',
        id: `direct-${gig.id}`,
        instrument: gig.wantedInstruments[0] ?? null,
        kind: 'direct',
        place: gigPlace(gig),
        title: gig.title,
      });
    }

    if (linkedEventIsVisible) continue;
    let source: Exclude<SessionSource, 'group'> | null = null;
    if (isMine) source = 'hosting';
    else if (myApplication?.status === 'accepted' || gig.targetStatus === 'accepted') {
      source = 'playing';
    } else if (!isDirect && myApplication?.status === 'pending') source = 'applied';
    if (!source) continue;

    const hostedApplications = applicationsByGig.get(gig.id) ?? [];
    const isFilled =
      gig.wantedInstruments.length > 0 &&
      gig.wantedInstruments.every((instrument) => gig.filledInstruments.includes(instrument));
    upcoming.push({
      approvedSongCount: 0,
      attendanceStatus: null,
      availableCount: 0,
      confirmDeadline: null,
      date: gig.date,
      eventId: gig.eventId,
      eventKind: null,
      gigId: gig.id,
      groupEmoji: null,
      groupId: gig.groupId,
      groupName: null,
      hostName: profileNameById.get(gig.hostId) ?? '',
      id: `${source}-${gig.id}`,
      instrument: myApplication?.instrument ?? gig.wantedInstruments[0] ?? null,
      isFilled,
      lineupState: null,
      missingRoles: [],
      pendingApplicantCount: hostedApplications.filter(
        (application) => application.status === 'pending',
      ).length,
      place: gigPlace(gig),
      presentCount: 0,
      recurrenceLabel: null,
      role: null,
      rosterCount: 0,
      source,
      title: gig.title,
    });
  }

  upcoming.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  past.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  directPending.sort(
    (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
  );
  groupPending.sort(
    (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
  );
  return { past, pendingResponses: [...directPending, ...groupPending], upcoming };
}

export function sessionsPresentation(
  upcoming: SessionItem[],
  pendingResponses: PendingSessionResponse[],
): SessionsPresentation {
  const confirmationIds = new Set(
    pendingResponses
      .filter((response): response is GroupPendingResponse => response.kind === 'group')
      .map((response) => response.sessionId),
  );
  const featured = upcoming.find((item) => !confirmationIds.has(item.id)) ?? null;
  return {
    featured,
    listed: upcoming.filter((item) => !confirmationIds.has(item.id) && item.id !== featured?.id),
  };
}

export function groupSessionsByMonth(
  sessions: SessionItem[],
  scope: SessionsScope,
): SessionMonth[] {
  const grouped = new Map<string, SessionItem[]>();
  for (const session of sessions) {
    const key = sessionMonthKey(session.date);
    const month = grouped.get(key) ?? [];
    month.push(session);
    grouped.set(key, month);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) =>
      scope === 'upcoming' ? left.localeCompare(right) : right.localeCompare(left),
    )
    .map(([key, monthSessions]) => ({ key, sessions: monthSessions }));
}

export function pastSessionsSummary(sessions: SessionItem[]): PastSessionsSummary {
  const groupSessions = sessions.filter((session) => session.source === 'group');
  const kinds = new Map<string, number>();
  for (const session of groupSessions) {
    if (!session.eventKind) continue;
    kinds.set(session.eventKind, (kinds.get(session.eventKind) ?? 0) + 1);
  }
  return {
    dates: groupSessions.length,
    groups: new Set(groupSessions.map((session) => session.groupId).filter(Boolean)).size,
    kinds: [...kinds.entries()]
      .sort(([left], [right]) => {
        const order = ['Concert', 'Répétition', 'Jam'];
        const leftIndex = order.indexOf(left);
        const rightIndex = order.indexOf(right);
        if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      })
      .map(([label, count]) => ({ count, label })),
    songs: groupSessions.reduce((total, session) => total + session.approvedSongCount, 0),
  };
}

export function countdownLabel(value: string, now = new Date(), locale = 'fr'): string | null {
  const date = validDate(value);
  if (!date) return null;
  const seconds = (date.getTime() - now.getTime()) / 1000;
  if (seconds <= 0) return null;
  const unit = seconds >= 48 * 3600 ? 'day' : seconds >= 3600 ? 'hour' : 'minute';
  const valueInUnit =
    unit === 'day'
      ? Math.floor(seconds / 86_400)
      : unit === 'hour'
        ? Math.floor(seconds / 3600)
        : Math.max(1, Math.floor(seconds / 60));
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    style: 'unit',
    unit,
    unitDisplay: 'short',
  }).format(valueInUnit);
}

export function attendancePayload(
  eventId: string,
  profileId: string,
  status: Exclude<AttendanceStatus, 'pending'>,
) {
  if (!eventId || !profileId || (status !== 'available' && status !== 'unavailable')) {
    throw new Error('attendance_response_invalid');
  }
  return { event_id: eventId, profile_id: profileId, status };
}

export function directResponsePayload(gigId: string, accept: boolean) {
  if (!gigId) throw new Error('direct_response_invalid');
  return { p_accept: accept, p_gig: gigId };
}
