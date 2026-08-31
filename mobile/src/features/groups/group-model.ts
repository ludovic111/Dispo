import type { MessageAttachment } from '@/features/messages/message-model';
import i18n from '@/i18n';

export type GroupMemberKind = 'guest' | 'permanent';
export type GroupAttendanceStatus = 'available' | 'pending' | 'unavailable';
export type GroupEventKind = 'Concert' | 'Jam' | 'Répétition';
export type GroupRecurrence =
  'Chaque mois' | 'Chaque semaine' | 'Ponctuel' | 'Toutes les 2 semaines';
export type GroupTab = 'events' | 'messages' | 'repertoire';
export type GroupPrivateLocationState = 'absent' | 'available' | 'restricted' | 'unknown';

export const GROUP_MESSAGE_MAX_LENGTH = 4_000;
export const GROUP_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙌'] as const;
export type GroupReactionEmoji = (typeof GROUP_REACTION_EMOJIS)[number];

export interface GroupMember {
  id: string;
  instruments: string[];
  isLeader: boolean;
  kind: GroupMemberKind;
  name: string;
  photoUrl: string | null;
  role: string | null;
}

export interface PendingGroupInvitation {
  createdAt: string;
  groupEmoji: string;
  groupId: string;
  groupName: string;
  groupPhotoUrl: string | null;
  id: string;
  invitedByName: string;
  kind: GroupMemberKind;
}

export interface GroupReactionSummary {
  count: number;
  emoji: GroupReactionEmoji;
  reactedByMe: boolean;
}

export function optimisticGroupReactions(
  current: readonly GroupReactionSummary[],
  nextEmoji: GroupReactionEmoji | null,
): GroupReactionSummary[] {
  const withoutMine = current.flatMap((reaction) => {
    if (!reaction.reactedByMe) return [reaction];
    if (reaction.count <= 1) return [];
    return [{ ...reaction, count: reaction.count - 1, reactedByMe: false }];
  });
  if (!nextEmoji) return withoutMine;
  const existingIndex = withoutMine.findIndex((reaction) => reaction.emoji === nextEmoji);
  if (existingIndex < 0) return [...withoutMine, { count: 1, emoji: nextEmoji, reactedByMe: true }];
  return withoutMine.map((reaction, index) =>
    index === existingIndex
      ? { ...reaction, count: reaction.count + 1, reactedByMe: true }
      : reaction,
  );
}

export interface GroupMessage {
  attachmentName: string | null;
  attachmentPath: string | null;
  attachmentSize: number | null;
  attachmentType: string | null;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  groupId: string;
  id: string;
  reactions: GroupReactionSummary[];
  senderId: string;
  senderName: string;
  senderPhotoUrl: string | null;
  text: string;
}

export type GroupMessageTimelineItem =
  | { id: string; kind: 'day'; date: string }
  | { id: string; kind: 'message'; message: GroupMessage }
  | { id: 'typing'; kind: 'typing' };

export function groupMessageAttachment(message: GroupMessage): MessageAttachment | null {
  if (
    !message.attachmentName ||
    !message.attachmentPath ||
    message.attachmentSize === null ||
    !message.attachmentType
  )
    return null;
  return {
    byteCount: message.attachmentSize,
    contentType: message.attachmentType,
    fileName: message.attachmentName,
    remotePath: message.attachmentPath,
  };
}

export interface GroupSong {
  albumTitle: string | null;
  artist: string;
  artworkUrl: string | null;
  catalogId: string | null;
  canonicalSongId: string | null;
  chords: string | null;
  composer: string | null;
  durationMilliseconds: number | null;
  form: string | null;
  genre: string | null;
  genres: string[];
  id: string;
  irealDisabled: boolean;
  irealUrl: string | null;
  isrc: string | null;
  isApproved: boolean;
  key: string | null;
  metadataSource: string | null;
  metadataUpdatedAt: string | null;
  platformIds: Record<string, string>;
  platformLinks: Record<string, string>;
  previewUrl: string | null;
  releaseYear: number | null;
  solos: string[];
  suggestedBy: string;
  tempoBpm: number | null;
  title: string;
  trackUrl: string | null;
}

export interface GroupDocument {
  addedBy: string | null;
  addedById: string | null;
  createdAt: string;
  extension: string;
  groupId: string;
  id: string;
  instrument: string | null;
  path: string;
  songId: string | null;
  title: string;
}

export interface GroupSongComment {
  authorId: string | null;
  authorName: string;
  createdAt: string;
  groupId: string;
  id: string;
  songId: string;
  text: string;
}

export interface GroupAttendance {
  profileId: string;
  status: GroupAttendanceStatus;
}

export interface GroupEvent {
  attendance: GroupAttendance[];
  city?: string | null;
  countryCode?: string | null;
  date: string;
  exactAddress: string | null;
  groupId: string;
  id: string;
  kind: GroupEventKind;
  latitude?: number | null;
  longitude?: number | null;
  postalCode?: string | null;
  privateLocationState: GroupPrivateLocationState;
  publicLocationLabel: string;
  recurrence: GroupRecurrence | null;
  reminderLeadDays: number | null;
  seriesId: string | null;
  setlist: GroupSong[];
  title: string;
  venue: string;
}

export interface MusicGroup {
  autoSosEnabled: boolean;
  autoSosMinLevel: string | null;
  comments: GroupSongComment[];
  documents: GroupDocument[];
  emoji: string;
  events: GroupEvent[];
  id: string;
  isPublic: boolean;
  leaderId: string;
  members: GroupMember[];
  messages: GroupMessage[];
  name: string;
  pendingInvitations: PendingGroupMember[];
  photoUrl: string | null;
  repertoire: GroupSong[];
}

export interface PendingGroupMember {
  createdAt: string;
  id: string;
  instruments: string[];
  kind: GroupMemberKind;
  name: string;
  photoUrl: string | null;
  profileId: string;
}

export interface GroupEventDraft {
  city: string;
  countryCode: string;
  date: string;
  exactAddress: string;
  kind: GroupEventKind;
  latitude?: number | null;
  longitude?: number | null;
  occurrenceCount: number;
  postalCode: string;
  recurrence: GroupRecurrence;
  reminderLeadDays: number;
  title: string;
  venue: string;
}

export interface EventSavePayload {
  clear_exact_address?: boolean;
  city: string;
  country_code: string;
  date: string;
  exact_address: string;
  id: string;
  kind: GroupEventKind;
  latitude: number | null;
  longitude: number | null;
  postal_code: string;
  public_location_label: string;
  recurrence: GroupRecurrence;
  reminder_lead_days: number;
  series_id: string | null;
  setlist: Record<string, unknown>[];
  title: string;
}

export interface GroupEventVenueDraft {
  city: string;
  countryCode: string;
  postalCode: string;
  venue: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function links(value: unknown): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function groupSongFromJson(value: unknown): GroupSong | null {
  const source = record(value);
  if (!source) return null;
  const id = nullableString(source.id);
  const title = nullableString(source.title);
  if (!id || !title) return null;
  const genre = nullableString(source.genre);
  const genres = stringArray(source.genres);
  return {
    albumTitle: nullableString(source.album_title),
    artist: stringValue(source.artist, i18n.t('Artiste inconnu')),
    artworkUrl: nullableString(source.artwork_url),
    catalogId: nullableString(source.catalog_id),
    canonicalSongId: nullableString(source.canonical_song_id)?.toLowerCase() ?? null,
    chords: nullableString(source.chords),
    composer: nullableString(source.composer),
    durationMilliseconds: nullableNumber(source.duration_ms),
    form: nullableString(source.form),
    genre,
    genres: genres.length ? genres : genre ? [genre] : [],
    id: id.toLowerCase(),
    irealDisabled: source.ireal_disabled === true,
    irealUrl: nullableString(source.ireal_url),
    isrc: nullableString(source.isrc),
    isApproved: source.is_approved === true,
    key: nullableString(source.key),
    metadataSource: nullableString(source.metadata_source),
    metadataUpdatedAt: nullableString(source.metadata_updated_at),
    platformIds: links(source.platform_ids),
    platformLinks: links(source.platform_links),
    previewUrl: nullableString(source.preview_url),
    releaseYear: nullableNumber(source.release_year),
    solos: stringArray(source.solos).map((solo) => solo.toLowerCase()),
    suggestedBy: stringValue(source.suggested_by),
    tempoBpm: nullableNumber(source.tempo_bpm),
    title,
    trackUrl: nullableString(source.track_url),
  };
}

export function groupSongsFromJson(value: unknown): GroupSong[] {
  if (!Array.isArray(value)) return [];
  return value.map(groupSongFromJson).filter((song): song is GroupSong => song !== null);
}

export function groupSongToJson(song: GroupSong): Record<string, unknown> {
  return {
    album_title: song.albumTitle,
    artist: song.artist,
    artwork_url: song.artworkUrl,
    catalog_id: song.catalogId,
    canonical_song_id: song.canonicalSongId,
    chords: song.chords,
    composer: song.composer,
    duration_ms: song.durationMilliseconds,
    form: song.form,
    genre: song.genre,
    genres: song.genres,
    id: song.id.toLowerCase(),
    ireal_disabled: song.irealDisabled,
    ireal_url: song.irealUrl,
    isrc: song.isrc,
    is_approved: song.isApproved,
    key: song.key,
    metadata_source: song.metadataSource,
    metadata_updated_at: song.metadataUpdatedAt,
    platform_ids: song.platformIds,
    platform_links: song.platformLinks,
    preview_url: song.previewUrl,
    release_year: song.releaseYear,
    solos: song.solos.map((solo) => solo.toLowerCase()),
    suggested_by: song.suggestedBy,
    tempo_bpm: song.tempoBpm,
    title: song.title,
    track_url: song.trackUrl,
  };
}

export function isGroupReactionEmoji(value: string): value is GroupReactionEmoji {
  return (GROUP_REACTION_EMOJIS as readonly string[]).includes(value);
}

export function aggregateGroupReactions(
  rows: readonly { emoji: string; profileId: string; removedAt: string | null }[],
  userId: string,
): GroupReactionSummary[] {
  const active = rows.filter((row) => row.removedAt === null && isGroupReactionEmoji(row.emoji));
  return GROUP_REACTION_EMOJIS.map((emoji) => {
    const matching = active.filter((row) => row.emoji === emoji);
    return {
      count: matching.length,
      emoji,
      reactedByMe: matching.some((row) => row.profileId === userId),
    };
  }).filter((summary) => summary.count > 0);
}

export function attendanceFor(event: GroupEvent, profileId: string): GroupAttendanceStatus {
  return event.attendance.find((entry) => entry.profileId === profileId)?.status ?? 'pending';
}

export function eventAttendanceSummary(event: GroupEvent) {
  return event.attendance.reduce(
    (summary, entry) => ({ ...summary, [entry.status]: summary[entry.status] + 1 }),
    { available: 0, pending: 0, unavailable: 0 },
  );
}

export function groupLineupState(
  event: GroupEvent,
  members: readonly GroupMember[],
  now = new Date(),
  replacementRoles: readonly string[] = [],
): 'complete' | 'forming' | 'late' {
  const requiredRoles = [
    ...new Set(
      members.map((member) => member.role).filter((role): role is string => Boolean(role)),
    ),
  ];
  const availableRoles = new Set(
    members
      .filter((member) => attendanceFor(event, member.id) === 'available')
      .map((member) => member.role)
      .filter((role): role is string => Boolean(role)),
  );
  const coveredRoles = new Set([...availableRoles, ...replacementRoles.filter(Boolean)]);
  const complete =
    requiredRoles.length > 0
      ? requiredRoles.every((role) => coveredRoles.has(role))
      : members.length > 0 &&
        members.every((member) => attendanceFor(event, member.id) === 'available');
  if (complete) return 'complete';
  const lead = Math.max(event.reminderLeadDays ?? 2, 0) * 86_400_000;
  return new Date(event.date).getTime() - lead <= now.getTime() ? 'late' : 'forming';
}

/** Rôles encore découverts, en comptant les remplaçant·es accepté·es. */
export function missingGroupEventRoles(
  event: GroupEvent,
  members: readonly GroupMember[],
  replacementRoles: readonly string[] = [],
): string[] {
  const requiredRoles = [
    ...new Set(
      members.map((member) => member.role).filter((role): role is string => Boolean(role)),
    ),
  ];
  const availableRoles = new Set(
    members
      .filter((member) => attendanceFor(event, member.id) === 'available')
      .map((member) => member.role)
      .filter((role): role is string => Boolean(role)),
  );
  const coveredRoles = new Set([...availableRoles, ...replacementRoles.filter(Boolean)]);
  return requiredRoles.filter((role) => !coveredRoles.has(role)).sort((a, b) => a.localeCompare(b));
}

export function recurrenceDates(
  startIso: string,
  recurrence: GroupRecurrence,
  requestedCount: number,
): string[] {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return [];
  const caps: Record<GroupRecurrence, number> = {
    'Chaque mois': 12,
    'Chaque semaine': 52,
    Ponctuel: 1,
    'Toutes les 2 semaines': 26,
  };
  const count = Math.min(Math.max(Math.floor(requestedCount), 1), caps[recurrence]);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    if (recurrence === 'Chaque mois') date.setMonth(start.getMonth() + index);
    if (recurrence === 'Chaque semaine') date.setDate(start.getDate() + index * 7);
    if (recurrence === 'Toutes les 2 semaines') date.setDate(start.getDate() + index * 14);
    return date.toISOString();
  });
}

export function buildEventSavePayloads(
  draft: GroupEventDraft,
  ids: readonly string[],
  seriesId: string | null,
): EventSavePayload[] {
  const dates = recurrenceDates(draft.date, draft.recurrence, draft.occurrenceCount);
  return dates.map((date, index) => ({
    city: draft.city.trim(),
    country_code: draft.countryCode.trim().toUpperCase() || 'CH',
    date,
    exact_address: draft.exactAddress.trim(),
    id: ids[index] ?? ids[0] ?? '',
    kind: draft.kind,
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
    postal_code: draft.postalCode.trim(),
    public_location_label: groupEventVenueLabel(draft),
    recurrence: draft.recurrence,
    reminder_lead_days: draft.reminderLeadDays,
    series_id: draft.recurrence === 'Ponctuel' ? null : seriesId,
    setlist: [],
    title: draft.title.trim(),
  }));
}

/** Même format de stockage que `VenueDraft.label` dans l'app Swift. */
export function groupEventVenueLabel(value: GroupEventVenueDraft): string {
  const venue = value.venue.trim();
  const postalCode = value.postalCode.trim().toUpperCase();
  const city = value.city.trim();
  const countryCode = value.countryCode.trim().toUpperCase() || 'CH';
  const locality = [postalCode, city].filter(Boolean).join(' ');
  const place = locality ? `${locality} · ${countryCode}` : countryCode;
  return venue ? `${venue} · ${place}` : place;
}

/** Compatibilité avec les anciennes lignes texte de `group_events.venue`. */
export function parseGroupEventVenueLabel(
  storageLabel: string,
  fallbackCountryCode = 'CH',
): GroupEventVenueDraft {
  const parts = storageLabel.split(' · ');
  const maybeCountry = parts.at(-1)?.trim().toUpperCase() ?? '';
  if (parts.length < 3 || !/^[A-Z]{2}$/.test(maybeCountry)) {
    return { city: '', countryCode: fallbackCountryCode, postalCode: '', venue: storageLabel };
  }
  const locality = parts.at(-2)?.trim() ?? '';
  const [postalCode = '', ...cityParts] = locality.split(/\s+/);
  return {
    city: cityParts.join(' '),
    countryCode: maybeCountry,
    postalCode,
    venue: parts.slice(0, -2).join(' · '),
  };
}

export function reorderSongs(songs: readonly GroupSong[], orderedApprovedIds: readonly string[]) {
  const approved = new Map(songs.filter((song) => song.isApproved).map((song) => [song.id, song]));
  const ordered = orderedApprovedIds.flatMap((id) => {
    const song = approved.get(id);
    if (!song) return [];
    approved.delete(id);
    return [song];
  });
  const remaining = songs.filter((song) => song.isApproved && approved.has(song.id));
  const normalizedApproved = [...ordered, ...remaining];
  let approvedIndex = 0;
  return songs.map((song) =>
    song.isApproved ? (normalizedApproved[approvedIndex++] ?? song) : song,
  );
}

export function isValidGroupMessage(text: string, hasAttachment = false): boolean {
  const cleaned = text.trim();
  return (cleaned.length > 0 || hasAttachment) && cleaned.length <= GROUP_MESSAGE_MAX_LENGTH;
}

export function upcomingGroupEvents(events: readonly GroupEvent[], now = new Date()): GroupEvent[] {
  return events
    .filter((event) => new Date(event.date).getTime() >= now.getTime())
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function latestGroupMessage(messages: readonly GroupMessage[]): GroupMessage | null {
  return (
    [...messages].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
}

function groupMessageDayKey(value: string): string {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-');
}

function compareGroupMessagesNewestFirst(left: GroupMessage, right: GroupMessage): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

/**
 * The thread cache is newest-first because the native list is inverted. A
 * Realtime echo can race the first page or an optimistic mutation, so IDs are
 * the authority and ordering always has the UUID tie-breaker used by SQL.
 */
export function mergeGroupMessagesNewestFirst(
  messages: readonly GroupMessage[],
  incoming?: GroupMessage,
): GroupMessage[] {
  const byId = new Map<string, GroupMessage>();
  for (const message of messages) {
    if (!byId.has(message.id)) byId.set(message.id, message);
  }
  if (incoming) {
    const current = byId.get(incoming.id);
    byId.set(
      incoming.id,
      current
        ? {
            ...incoming,
            reactions: incoming.reactions.length > 0 ? incoming.reactions : current.reactions,
            senderName:
              incoming.senderName === 'Membre' || incoming.senderName === i18n.t('Membre')
                ? current.senderName
                : incoming.senderName,
            senderPhotoUrl: incoming.senderPhotoUrl ?? current.senderPhotoUrl,
          }
        : incoming,
    );
  }
  return [...byId.values()].sort(compareGroupMessagesNewestFirst);
}

/** Same divider contract as direct messages, adapted to group senders. */
export function buildGroupMessageTimeline(
  messages: readonly GroupMessage[],
  someoneIsTyping = false,
): GroupMessageTimelineItem[] {
  const ordered = mergeGroupMessagesNewestFirst(messages);
  const items: GroupMessageTimelineItem[] = someoneIsTyping
    ? [{ id: 'typing', kind: 'typing' }]
    : [];
  ordered.forEach((message, index) => {
    items.push({ id: `message:${message.id}`, kind: 'message', message });
    const older = ordered[index + 1];
    if (!older || groupMessageDayKey(older.createdAt) !== groupMessageDayKey(message.createdAt)) {
      items.push({
        date: message.createdAt,
        id: `day:${groupMessageDayKey(message.createdAt)}`,
        kind: 'day',
      });
    }
  });
  return items;
}
