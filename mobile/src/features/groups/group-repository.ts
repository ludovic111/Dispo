import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';

import { openDocumentPreview } from '../../../modules/dispo-document-preview';

import {
  aggregateGroupReactions,
  buildEventSavePayloads,
  groupEventVenueLabel,
  groupSongsFromJson,
  groupSongToJson,
  isValidGroupMessage,
  type GroupAttendanceStatus,
  type GroupDocument,
  type GroupEvent,
  type GroupEventDraft,
  type GroupMember,
  type GroupMemberKind,
  type GroupMessage,
  type GroupPrivateLocationState,
  type GroupReactionEmoji,
  type GroupSong,
  type GroupSongComment,
  type MusicGroup,
  type PendingGroupInvitation,
  type PendingGroupMember,
} from './group-model';
import {
  containsGroupSong,
  type GroupSongCopyResult,
  type GroupSongCopyStatus,
  type GroupSongCopyTarget,
} from './group-song-copy';

import { groupBy } from '@/domain/group-by';
import { pageRange, type Page } from '@/domain/pagination';
import { normalizeSongText } from '@/domain/song';
import {
  MESSAGE_ATTACHMENT_MAX_BYTES,
  type PendingMessageAttachment,
} from '@/features/messages/message-model';
import i18n from '@/i18n';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database, Json } from '@/services/supabase/database.types';
import { subscribeToRealtimeBroadcast } from '@/services/supabase/realtime-broadcast';
import { uniqueRealtimeTopic } from '@/services/supabase/realtime-topic';

type GroupRow = Database['public']['Tables']['music_groups']['Row'];
type MemberRow = Database['public']['Tables']['group_members']['Row'];
type EventRow = Database['public']['Tables']['group_events']['Row'];
type AttendanceRow = Database['public']['Tables']['event_attendance']['Row'];
type MessageRow = Database['public']['Tables']['group_messages']['Row'];
type ReactionRow = Database['public']['Tables']['group_message_reactions']['Row'];
type DocumentRow = Database['public']['Tables']['group_docs']['Row'];
type CommentRow = Database['public']['Tables']['song_comments']['Row'];
type InvitationRow = Database['public']['Tables']['group_invitations']['Row'];
type EventLocationRow =
  Database['public']['Functions']['visible_group_event_locations']['Returns'][number];

export interface GroupProfileCandidate {
  id: string;
  instruments: string[];
  name: string;
  photoUrl: string | null;
}

export interface SongCatalogResult {
  albumTitle: string | null;
  artist: string;
  artworkUrl: string | null;
  catalogId: string;
  canonicalSongId: string | null;
  composer: string | null;
  durationMilliseconds: number | null;
  genre: string | null;
  genres: string[];
  isrc: string | null;
  key: string | null;
  metadataSource: string;
  metadataUpdatedAt: string;
  platformIds: Record<string, string>;
  platformLinks: Record<string, string>;
  previewUrl: string | null;
  releaseYear: number | null;
  tempoBpm: number | null;
  title: string;
  trackUrl: string | null;
}

export interface SongEnrichmentRequestResult {
  audioMetrics: 'client_fallback' | 'server_optional' | null;
  refreshed: SongCatalogResult | null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SongCatalogRpcRow {
  album_title?: unknown;
  artist?: unknown;
  artwork_url?: unknown;
  composer?: unknown;
  duration_ms?: unknown;
  genres?: unknown;
  id?: unknown;
  isrc?: unknown;
  musical_key?: unknown;
  metadata_source?: unknown;
  metadata_updated_at?: unknown;
  platform_ids?: unknown;
  platform_links?: unknown;
  release_year?: unknown;
  tempo_bpm?: unknown;
  title?: unknown;
}

export interface CreateGroupInput {
  emoji: string;
  memberIds: string[];
  name: string;
}

export interface CreateGroupResult {
  failedInvitationCount: number;
  groupId: string;
}

export interface UpdateGroupSettingsInput {
  autoSosEnabled: boolean;
  autoSosMinLevel: string | null;
  groupId: string;
  isPublic: boolean;
  name: string;
}

export interface UpdateGroupEventInput {
  kind?: GroupEvent['kind'];
  city: string;
  clearExactAddress: boolean;
  countryCode: string;
  date: string;
  event: GroupEvent;
  events: readonly GroupEvent[];
  exactAddress: string;
  groupId: string;
  latitude: number | null;
  leaderId: string;
  longitude: number | null;
  postalCode: string;
  reminderLeadDays: number;
  scope: 'futureOccurrences' | 'thisDate';
  title: string;
  venue: string;
}

export interface UploadGroupDocumentInput {
  contentType: string;
  extension: string;
  groupId: string;
  instrument: string | null;
  songId: string | null;
  title: string;
  uri: string;
  userId: string;
}

export interface UploadGroupPhotoInput {
  contentType: string;
  groupId: string;
  leaderId: string;
  uri: string;
}

const groupColumns =
  'id,name,emoji,photo_url,is_public,leader_id,repertoire,auto_sos_enabled,auto_sos_min_level,created_at,updated_at' as const;
const memberColumns = 'group_id,profile_id,kind,role,joined_at' as const;
const eventColumns =
  'id,group_id,kind,title,venue,public_location_label,date,setlist,series_id,recurrence,reminder_lead_days,created_at,schedule_changed_at' as const;
const attendanceColumns = 'event_id,profile_id,status,responded_at' as const;
const reactionColumns = 'message_id,profile_id,emoji,removed_at,created_at' as const;
const documentColumns =
  'id,group_id,title,path,ext,added_by,created_at,song_id,instrument' as const;
const commentColumns = 'id,group_id,song_id,author_id,text,created_at' as const;
const invitationColumns = 'id,group_id,profile_id,invited_by,kind,created_at' as const;
const profileColumns = 'id,name,photo_url,instruments' as const;
const messageColumns =
  'id,group_id,sender_id,text,created_at,edited_at,deleted_at,attachment_path,attachment_name,attachment_type,attachment_size' as const;
const messageFilesBucket = 'message-files';
const groupDocsBucket = 'group-docs';
const attachmentMaxBytes = 25 * 1_024 * 1_024;

function nullableCatalogString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function catalogStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  );
}

function songCatalogRpcResult(value: unknown): SongCatalogResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as SongCatalogRpcRow;
  const canonicalSongId = nullableCatalogString(row.id)?.toLowerCase() ?? null;
  const title = nullableCatalogString(row.title);
  if (!canonicalSongId || !title) return null;
  const artist = nullableCatalogString(row.artist) ?? i18n.t('Artiste inconnu');
  const platformIds = catalogStringRecord(row.platform_ids);
  const platformLinks = catalogStringRecord(row.platform_links);
  const appleId = platformIds.appleMusic;
  const genres = Array.isArray(row.genres)
    ? row.genres.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  return {
    albumTitle: nullableCatalogString(row.album_title),
    artist,
    artworkUrl: nullableCatalogString(row.artwork_url),
    catalogId: appleId ? `apple:${appleId}` : `dispo:${canonicalSongId}`,
    canonicalSongId,
    composer: nullableCatalogString(row.composer),
    durationMilliseconds:
      typeof row.duration_ms === 'number' && Number.isFinite(row.duration_ms)
        ? row.duration_ms
        : null,
    genre: genres[0] ?? null,
    genres,
    isrc: nullableCatalogString(row.isrc),
    key: nullableCatalogString(row.musical_key),
    metadataSource: nullableCatalogString(row.metadata_source) ?? 'dispo-catalog',
    metadataUpdatedAt: nullableCatalogString(row.metadata_updated_at) ?? new Date(0).toISOString(),
    platformIds,
    platformLinks,
    previewUrl: null,
    releaseYear:
      typeof row.release_year === 'number' && Number.isFinite(row.release_year)
        ? row.release_year
        : null,
    tempoBpm:
      typeof row.tempo_bpm === 'number' && Number.isFinite(row.tempo_bpm)
        ? Math.round(row.tempo_bpm)
        : null,
    title,
    trackUrl: platformLinks.appleMusic ?? null,
  };
}

async function searchCanonicalSongCatalog(
  query: string,
  signal?: AbortSignal,
): Promise<SongCatalogResult[]> {
  const request = getSupabaseClient().rpc(
    'search_song_catalog' as never,
    {
      p_after_id: null,
      p_after_title: null,
      p_limit: 20,
      p_market: 'CH',
      p_query: query,
    } as never,
  );
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  // La migration du catalogue est volontairement progressive. Tant qu'elle
  // n'est pas appliquée au backend, la recherche Apple ci-dessous reste le
  // repli fonctionnel sans bloquer l'app.
  if (error || !Array.isArray(data)) return [];
  const rows = data as unknown[];
  return rows.flatMap((row) => {
    const result = songCatalogRpcResult(row);
    return result ? [result] : [];
  });
}

async function searchAppleSongCatalog(
  term: string,
  signal?: AbortSignal,
): Promise<SongCatalogResult[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('country', 'CH');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '20');
  url.searchParams.set('media', 'music');
  url.searchParams.set('term', query);
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error('song_catalog_unavailable');
  const payload = (await response.json()) as { results?: unknown[] };
  const metadataUpdatedAt = new Date().toISOString();
  return (payload.results ?? []).flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.trackId !== 'number' || typeof row.trackName !== 'string') return [];
    const genre = typeof row.primaryGenreName === 'string' ? row.primaryGenreName : null;
    const trackUrl = typeof row.trackViewUrl === 'string' ? row.trackViewUrl : null;
    return [
      {
        albumTitle: typeof row.collectionName === 'string' ? row.collectionName : null,
        artist: typeof row.artistName === 'string' ? row.artistName : i18n.t('Artiste inconnu'),
        artworkUrl:
          typeof row.artworkUrl100 === 'string'
            ? row.artworkUrl100.replace('100x100bb', '600x600bb')
            : null,
        catalogId: `apple:${row.trackId}`,
        canonicalSongId: null,
        composer: typeof row.composerName === 'string' ? row.composerName : null,
        durationMilliseconds: typeof row.trackTimeMillis === 'number' ? row.trackTimeMillis : null,
        genre,
        genres: genre ? [genre] : [],
        isrc: null,
        key: null,
        metadataSource: 'apple-itunes-search',
        metadataUpdatedAt,
        platformIds: { appleMusic: String(row.trackId) },
        platformLinks: trackUrl && /^https:\/\//i.test(trackUrl) ? { appleMusic: trackUrl } : {},
        previewUrl: typeof row.previewUrl === 'string' ? row.previewUrl : null,
        releaseYear:
          typeof row.releaseDate === 'string' ? new Date(row.releaseDate).getUTCFullYear() : null,
        tempoBpm: null,
        title: row.trackName,
        trackUrl,
      },
    ];
  });
}

function songCatalogIdentities(song: SongCatalogResult): string[] {
  const identities: string[] = [];
  const isrc = song.isrc?.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (isrc) identities.push(`isrc:${isrc}`);
  const appleId = song.platformIds.appleMusic ?? song.catalogId.match(/^apple:(\d+)$/)?.[1];
  if (appleId) identities.push(`apple:${appleId}`);
  if (!identities.length) {
    identities.push(`text:${normalizeSongText(song.artist)}|${normalizeSongText(song.title)}`);
  }
  return identities;
}

function mergeSongCatalogResult(
  canonical: SongCatalogResult,
  supplement: SongCatalogResult,
): SongCatalogResult {
  const unknownArtist = normalizeSongText(i18n.t('Artiste inconnu'));
  const canonicalArtist = normalizeSongText(canonical.artist);
  return {
    albumTitle: canonical.albumTitle ?? supplement.albumTitle,
    artist:
      !canonicalArtist || canonicalArtist === unknownArtist ? supplement.artist : canonical.artist,
    artworkUrl: canonical.artworkUrl ?? supplement.artworkUrl,
    catalogId: canonical.catalogId,
    canonicalSongId: canonical.canonicalSongId ?? supplement.canonicalSongId,
    composer: canonical.composer ?? supplement.composer,
    durationMilliseconds: canonical.durationMilliseconds ?? supplement.durationMilliseconds,
    genre: canonical.genre ?? supplement.genre,
    genres: [...new Set([...canonical.genres, ...supplement.genres])],
    isrc: canonical.isrc ?? supplement.isrc,
    key: canonical.key ?? supplement.key,
    metadataSource: canonical.metadataSource,
    metadataUpdatedAt: canonical.metadataUpdatedAt,
    platformIds: { ...supplement.platformIds, ...canonical.platformIds },
    platformLinks: { ...supplement.platformLinks, ...canonical.platformLinks },
    previewUrl: canonical.previewUrl ?? supplement.previewUrl,
    releaseYear: canonical.releaseYear ?? supplement.releaseYear,
    tempoBpm: canonical.tempoBpm ?? supplement.tempoBpm,
    title: canonical.title || supplement.title,
    trackUrl: canonical.trackUrl ?? supplement.trackUrl,
  };
}

/**
 * Le catalogue partagé (quand sa migration est active) passe en premier afin
 * de réutiliser ses liens exacts. Apple complète les résultats et reste le
 * repli intégral pendant la migration progressive du backend.
 */
export async function searchSongCatalog(
  term: string,
  signal?: AbortSignal,
): Promise<SongCatalogResult[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  const [canonical, apple] = await Promise.all([
    searchCanonicalSongCatalog(query, signal).catch(() => []),
    searchAppleSongCatalog(query, signal).catch(() => []),
  ]);
  const ordered: (SongCatalogResult | null)[] = [];
  const indexByIdentity = new Map<string, number>();
  for (const item of [...canonical, ...apple]) {
    const identities = songCatalogIdentities(item);
    const matchingIndexes = [
      ...new Set(
        identities.flatMap((identity) => {
          const index = indexByIdentity.get(identity);
          return index === undefined ? [] : [index];
        }),
      ),
    ];
    if (!matchingIndexes.length) {
      const index = ordered.push(item) - 1;
      for (const identity of identities) indexByIdentity.set(identity, index);
      continue;
    }

    const targetIndex = matchingIndexes[0] as number;
    let merged = ordered[targetIndex] as SongCatalogResult;
    for (const duplicateIndex of matchingIndexes.slice(1)) {
      const duplicate = ordered[duplicateIndex];
      if (!duplicate) continue;
      merged = mergeSongCatalogResult(merged, duplicate);
      ordered[duplicateIndex] = null;
      for (const [identity, index] of indexByIdentity) {
        if (index === duplicateIndex) indexByIdentity.set(identity, targetIndex);
      }
    }
    merged = mergeSongCatalogResult(merged, item);
    ordered[targetIndex] = merged;
    for (const identity of new Set([...identities, ...songCatalogIdentities(merged)])) {
      indexByIdentity.set(identity, targetIndex);
    }
  }
  return ordered.filter((item): item is SongCatalogResult => item !== null);
}

/**
 * Demande l'enrichissement exact d'un morceau canonique. L'Edge Function
 * traite immédiatement le petit lot côté serveur, puis le client relit la
 * source canonique au lieu de faire confiance au corps HTTP du fournisseur.
 */
export async function enrichSongCatalogResult(
  song: SongCatalogResult,
): Promise<SongEnrichmentRequestResult> {
  const canonicalSongId = song.canonicalSongId;
  const appleId = song.platformIds.appleMusic ?? song.catalogId.match(/^apple:(\d+)$/)?.[1];
  const appleUrl = song.platformLinks.appleMusic ?? song.trackUrl;
  const body =
    canonicalSongId && uuidPattern.test(canonicalSongId)
      ? { action: 'enqueue', song_id: canonicalSongId }
      : appleId && appleUrl
        ? { action: 'enqueue', apple_id: appleId, apple_url: appleUrl }
        : null;
  if (!body) {
    return { audioMetrics: 'client_fallback', refreshed: null };
  }
  const { data, error } = await getSupabaseClient().functions.invoke('song-enrichment', {
    body,
  });
  if (error) throw error;
  const payload =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const audioMetrics =
    payload.audio_metrics === 'client_fallback' || payload.audio_metrics === 'server_optional'
      ? payload.audio_metrics
      : null;
  const responseSongId =
    typeof payload.song_id === 'string' && uuidPattern.test(payload.song_id)
      ? payload.song_id
      : canonicalSongId;
  const results = await searchCanonicalSongCatalog(`${song.title} ${song.artist}`);
  const refreshed =
    results.find((candidate) => candidate.canonicalSongId === responseSongId) ??
    results.find((candidate) =>
      songCatalogIdentities(candidate).some((id) => songCatalogIdentities(song).includes(id)),
    ) ??
    null;
  return { audioMetrics, refreshed };
}

function memberKind(value: string): GroupMemberKind {
  return value === 'guest' ? 'guest' : 'permanent';
}

function attendanceStatus(value: string): GroupAttendanceStatus {
  if (value === 'available' || value === 'unavailable') return value;
  return 'pending';
}

function eventKind(value: string): GroupEvent['kind'] {
  if (value === 'Concert' || value === 'Jam') return value;
  return 'Répétition';
}

function recurrence(value: string | null): GroupEvent['recurrence'] {
  if (
    value === 'Chaque mois' ||
    value === 'Chaque semaine' ||
    value === 'Ponctuel' ||
    value === 'Toutes les 2 semaines'
  )
    return value;
  return null;
}

function profileMap(
  profiles: readonly {
    id: string;
    instruments: string[];
    name: string;
    photo_url: string | null;
  }[],
) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function mapMembers(
  rows: readonly MemberRow[],
  group: GroupRow,
  profiles: ReturnType<typeof profileMap>,
): GroupMember[] {
  return rows
    .filter((row) => row.group_id === group.id)
    .map((row) => {
      const profile = profiles.get(row.profile_id);
      return {
        id: row.profile_id,
        instruments: profile?.instruments ?? [],
        isLeader: row.profile_id === group.leader_id,
        kind: memberKind(row.kind),
        name: profile?.name || i18n.t('Musicien'),
        photoUrl: profile?.photo_url ?? null,
        role: row.role,
      };
    })
    .sort(
      (left, right) =>
        Number(right.isLeader) - Number(left.isLeader) || left.name.localeCompare(right.name),
    );
}

function mapMessages(
  rows: readonly MessageRow[],
  reactions: ReadonlyMap<string, readonly ReactionRow[]>,
  groupId: string,
  userId: string,
  profiles: ReturnType<typeof profileMap>,
): GroupMessage[] {
  return rows
    .filter((row) => row.group_id === groupId)
    .map((row) => {
      const profile = profiles.get(row.sender_id);
      return {
        attachmentName: row.attachment_name,
        attachmentPath: row.attachment_path,
        attachmentSize: row.attachment_size,
        attachmentType: row.attachment_type,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
        editedAt: row.edited_at,
        groupId: row.group_id,
        id: row.id,
        reactions: aggregateGroupReactions(
          (reactions.get(row.id) ?? []).map((reaction) => ({
            emoji: reaction.emoji,
            profileId: reaction.profile_id,
            removedAt: reaction.removed_at,
          })),
          userId,
        ),
        senderId: row.sender_id,
        senderName: profile?.name || i18n.t('Membre'),
        senderPhotoUrl: profile?.photo_url ?? null,
        text: row.text,
      };
    })
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
}

export interface GroupMessageSender {
  name: string;
  photoUrl: string | null;
}

export function groupMessageFromRealtimeRow(
  row: MessageRow,
  userId: string,
  sender?: GroupMessageSender,
): GroupMessage {
  const profiles: ReturnType<typeof profileMap> = new Map();
  if (sender)
    profiles.set(row.sender_id, {
      id: row.sender_id,
      instruments: [],
      name: sender.name,
      photo_url: sender.photoUrl,
    });
  const message = mapMessages([row], new Map(), row.group_id, userId, profiles)[0];
  if (!message) throw new Error('group_message_invalid');
  return message;
}

function mapDocuments(
  rows: readonly DocumentRow[],
  groupId: string,
  profiles: ReturnType<typeof profileMap>,
): GroupDocument[] {
  return rows
    .filter((row) => row.group_id === groupId)
    .map((row) => ({
      addedBy: row.added_by ? (profiles.get(row.added_by)?.name ?? null) : null,
      addedById: row.added_by,
      createdAt: row.created_at,
      extension: row.ext,
      groupId: row.group_id,
      id: row.id,
      instrument: row.instrument,
      path: row.path,
      songId: row.song_id,
      title: row.title,
    }));
}

function mapComments(
  rows: readonly CommentRow[],
  groupId: string,
  profiles: ReturnType<typeof profileMap>,
): GroupSongComment[] {
  return rows
    .filter((row) => row.group_id === groupId)
    .map((row) => ({
      authorId: row.author_id,
      authorName: row.author_id
        ? profiles.get(row.author_id)?.name || i18n.t('Membre')
        : i18n.t('Membre'),
      createdAt: row.created_at,
      groupId: row.group_id,
      id: row.id,
      songId: row.song_id,
      text: row.text,
    }));
}

function mapPendingMembers(
  rows: readonly InvitationRow[],
  groupId: string,
  profiles: ReturnType<typeof profileMap>,
): PendingGroupMember[] {
  return rows
    .filter((row) => row.group_id === groupId)
    .map((row) => {
      const profile = profiles.get(row.profile_id);
      return {
        createdAt: row.created_at,
        id: row.id,
        instruments: profile?.instruments ?? [],
        kind: memberKind(row.kind),
        name: profile?.name || i18n.t('Musicien'),
        photoUrl: profile?.photo_url ?? null,
        profileId: row.profile_id,
      };
    });
}

function mapEvents(
  rows: readonly EventRow[],
  attendance: ReadonlyMap<string, readonly AttendanceRow[]>,
  locations: ReadonlyMap<string, EventLocationRow>,
  privateLocationsLoaded: boolean,
  groupId: string,
): GroupEvent[] {
  return rows
    .filter((row) => row.group_id === groupId)
    .map((row) => {
      const location = locations.get(row.id);
      const privateLocationState: GroupPrivateLocationState = !privateLocationsLoaded
        ? 'unknown'
        : !location
          ? 'restricted'
          : location.exact_address?.trim()
            ? 'available'
            : 'absent';
      return {
        attendance: (attendance.get(row.id) ?? []).map((entry) => ({
          profileId: entry.profile_id,
          status: attendanceStatus(entry.status),
        })),
        city: location?.city || null,
        countryCode: location?.country_code || null,
        date: row.date,
        scheduleChangedAt: row.schedule_changed_at,
        exactAddress: location?.exact_address || null,
        groupId: row.group_id,
        id: row.id,
        kind: eventKind(row.kind),
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        postalCode: location?.postal_code || null,
        privateLocationState,
        publicLocationLabel: row.public_location_label || row.venue,
        recurrence: recurrence(row.recurrence),
        reminderLeadDays: row.reminder_lead_days,
        seriesId: row.series_id,
        setlist: groupSongsFromJson(row.setlist),
        title: row.title,
        venue: row.venue,
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function fetchGroups(userId: string, signal?: AbortSignal): Promise<MusicGroup[]> {
  if (!userId) return [];
  const supabase = getSupabaseClient();
  const groupQuery = supabase
    .from('music_groups')
    .select(groupColumns)
    .order('updated_at', { ascending: false });
  const groupResult = await (signal ? groupQuery.abortSignal(signal) : groupQuery);
  if (groupResult.error) throw groupResult.error;
  const groups = groupResult.data as GroupRow[];
  if (groups.length === 0) return [];
  const groupIds = groups.map((group) => group.id);

  const memberQuery = supabase.from('group_members').select(memberColumns).in('group_id', groupIds);
  const eventQuery = supabase.from('group_events').select(eventColumns).in('group_id', groupIds);
  const messageQuery = supabase.rpc('recent_group_messages', { p_limit: 60 });
  const documentQuery = supabase
    .from('group_docs')
    .select(documentColumns)
    .in('group_id', groupIds);
  const commentQuery = supabase
    .from('song_comments')
    .select(commentColumns)
    .in('group_id', groupIds);
  const invitationQuery = supabase
    .from('group_invitations')
    .select(invitationColumns)
    .in('group_id', groupIds);
  const locationQuery = supabase.rpc('visible_group_event_locations');
  const [
    memberResult,
    eventResult,
    messageResult,
    documentResult,
    commentResult,
    invitationResult,
    locationResult,
  ] = await Promise.all([
    signal ? memberQuery.abortSignal(signal) : memberQuery,
    signal ? eventQuery.abortSignal(signal) : eventQuery,
    signal ? messageQuery.abortSignal(signal) : messageQuery,
    signal ? documentQuery.abortSignal(signal) : documentQuery,
    signal ? commentQuery.abortSignal(signal) : commentQuery,
    signal ? invitationQuery.abortSignal(signal) : invitationQuery,
    signal ? locationQuery.abortSignal(signal) : locationQuery,
  ]);
  for (const result of [
    memberResult,
    eventResult,
    messageResult,
    documentResult,
    commentResult,
    invitationResult,
  ]) {
    if (result.error) throw result.error;
  }
  const members = memberResult.data as MemberRow[];
  const events = eventResult.data as EventRow[];
  const messages = messageResult.data as MessageRow[];
  const documents = documentResult.data as DocumentRow[];
  const comments = commentResult.data as CommentRow[];
  const invitations = invitationResult.data as InvitationRow[];
  const eventIds = events.map((event) => event.id);
  const messageIds = messages.map((message) => message.id);
  const profileIds = new Set<string>([
    ...members.map((row) => row.profile_id),
    ...messages.map((row) => row.sender_id),
    ...comments.flatMap((row) => (row.author_id ? [row.author_id] : [])),
    ...documents.flatMap((row) => (row.added_by ? [row.added_by] : [])),
    ...invitations.map((row) => row.profile_id),
  ]);

  const attendanceQuery = supabase
    .from('event_attendance')
    .select(attendanceColumns)
    .in('event_id', eventIds);
  const reactionQuery = supabase
    .from('group_message_reactions')
    .select(reactionColumns)
    .in('message_id', messageIds);
  const profileQuery = supabase
    .from('profiles')
    .select(profileColumns)
    .in('id', [...profileIds]);
  const [attendanceResult, reactionResult, profileResult] = await Promise.all([
    eventIds.length === 0
      ? Promise.resolve({ data: [] as AttendanceRow[], error: null })
      : signal
        ? attendanceQuery.abortSignal(signal)
        : attendanceQuery,
    messageIds.length === 0
      ? Promise.resolve({ data: [] as ReactionRow[], error: null })
      : signal
        ? reactionQuery.abortSignal(signal)
        : reactionQuery,
    profileIds.size === 0
      ? Promise.resolve({ data: [], error: null })
      : signal
        ? profileQuery.abortSignal(signal)
        : profileQuery,
  ]);
  if (attendanceResult.error) throw attendanceResult.error;
  if (reactionResult.error) throw reactionResult.error;
  if (profileResult.error) throw profileResult.error;
  const profiles = profileMap(profileResult.data);
  const locationMap = new Map(
    (locationResult.data ?? []).map((location) => [location.event_id, location]),
  );

  const membersByGroup = groupBy(members, (row) => row.group_id);
  const eventsByGroup = groupBy(events, (row) => row.group_id);
  const messagesByGroup = groupBy(messages, (row) => row.group_id);
  const documentsByGroup = groupBy(documents, (row) => row.group_id);
  const commentsByGroup = groupBy(comments, (row) => row.group_id);
  const invitationsByGroup = groupBy(invitations, (row) => row.group_id);
  const attendanceByEvent = groupBy(
    attendanceResult.data as AttendanceRow[],
    (row) => row.event_id,
  );
  const reactionsByMessage = groupBy(reactionResult.data as ReactionRow[], (row) => row.message_id);

  return groups.map((group) => ({
    autoSosEnabled: group.auto_sos_enabled,
    autoSosMinLevel: group.auto_sos_min_level,
    comments: mapComments(commentsByGroup.get(group.id) ?? [], group.id, profiles),
    documents: mapDocuments(documentsByGroup.get(group.id) ?? [], group.id, profiles),
    emoji: group.emoji,
    events: mapEvents(
      eventsByGroup.get(group.id) ?? [],
      attendanceByEvent,
      locationMap,
      !locationResult.error,
      group.id,
    ),
    id: group.id,
    isPublic: group.is_public,
    leaderId: group.leader_id,
    members: mapMembers(membersByGroup.get(group.id) ?? [], group, profiles),
    messages: mapMessages(
      messagesByGroup.get(group.id) ?? [],
      reactionsByMessage,
      group.id,
      userId,
      profiles,
    ),
    name: group.name,
    pendingInvitations: mapPendingMembers(
      invitationsByGroup.get(group.id) ?? [],
      group.id,
      profiles,
    ),
    photoUrl: group.photo_url,
    repertoire: groupSongsFromJson(group.repertoire),
  }));
}

/**
 * Loads one bounded slice of a single group thread. The database order and
 * client order share the same `(created_at, id)` tie-breaker, which keeps
 * offset pagination deterministic while the current schema has no cursor RPC.
 */
export async function fetchGroupMessagesPage(
  groupId: string,
  userId: string,
  page: number,
  pageSize = 40,
  signal?: AbortSignal,
): Promise<Page<GroupMessage>> {
  if (!groupId || !userId) return { items: [], nextPage: null };
  const { from, to } = pageRange(page, pageSize);
  const supabase = getSupabaseClient();
  const messageQuery = supabase
    .from('group_messages')
    .select(messageColumns)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to + 1);
  const messageResult = await (signal ? messageQuery.abortSignal(signal) : messageQuery);
  if (messageResult.error) throw messageResult.error;
  const allRows = messageResult.data as MessageRow[];
  const rows = allRows.slice(0, pageSize);
  if (rows.length === 0) return { items: [], nextPage: null };

  const messageIds = rows.map((row) => row.id);
  const senderIds = [...new Set(rows.map((row) => row.sender_id))];
  const reactionQuery = supabase
    .from('group_message_reactions')
    .select(reactionColumns)
    .in('message_id', messageIds)
    .is('removed_at', null);
  const profileQuery = supabase.from('profiles').select(profileColumns).in('id', senderIds);
  const [reactionResult, profileResult] = await Promise.all([
    signal ? reactionQuery.abortSignal(signal) : reactionQuery,
    signal ? profileQuery.abortSignal(signal) : profileQuery,
  ]);
  if (reactionResult.error) throw reactionResult.error;
  if (profileResult.error) throw profileResult.error;
  return {
    items: mapMessages(
      rows,
      groupBy(reactionResult.data as ReactionRow[], (row) => row.message_id),
      groupId,
      userId,
      profileMap(profileResult.data),
    ).reverse(),
    nextPage: allRows.length > pageSize ? page + 1 : null,
  };
}

export async function fetchGroupMessageReactions(
  messageId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<GroupMessage['reactions']> {
  if (!messageId || !userId) return [];
  const query = getSupabaseClient()
    .from('group_message_reactions')
    .select(reactionColumns)
    .eq('message_id', messageId)
    .is('removed_at', null);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return aggregateGroupReactions(
    (result.data as ReactionRow[]).map((reaction) => ({
      emoji: reaction.emoji,
      profileId: reaction.profile_id,
      removedAt: reaction.removed_at,
    })),
    userId,
  );
}

export async function fetchGroupInvitations(
  signal?: AbortSignal,
): Promise<PendingGroupInvitation[]> {
  const query = getSupabaseClient().rpc('my_group_invitations');
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return result.data.map((row) => ({
    createdAt: row.created_at,
    groupEmoji: row.group_emoji,
    groupId: row.group_id,
    groupName: row.group_name,
    groupPhotoUrl: row.group_photo_url || null,
    id: row.id,
    invitedByName: row.invited_by_name || i18n.t('Un musicien'),
    kind: memberKind(row.kind),
  }));
}

export async function fetchGroupProfileCandidates(
  signal?: AbortSignal,
): Promise<GroupProfileCandidate[]> {
  const query = getSupabaseClient().from('profiles').select(profileColumns).order('name');
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return result.data.map((profile) => ({
    id: profile.id,
    instruments: profile.instruments,
    name: profile.name || i18n.t('Musicien'),
    photoUrl: profile.photo_url,
  }));
}

export async function createGroup(
  userId: string,
  input: CreateGroupInput,
): Promise<CreateGroupResult> {
  const name = input.name.trim();
  const memberIds = [...new Set(input.memberIds)].filter((id) => id !== userId);
  if (!userId) throw new Error('group_auth_required');
  if (!name || memberIds.length === 0) throw new Error('group_invalid');
  const supabase = getSupabaseClient();
  const groupId = randomUUID().toLowerCase();
  const created = await supabase
    .from('music_groups')
    .insert({ emoji: input.emoji || '🎶', id: groupId, leader_id: userId, name });
  if (created.error) throw created.error;
  // Comme Swift, le groupe reste utilisable si une invitation individuelle
  // échoue : on tente les autres et l'écran annonce honnêtement le résultat.
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
  return {
    failedInvitationCount: invitations.filter(Boolean).length,
    groupId,
  };
}

export async function acceptGroupInvitation(invitationId: string): Promise<void> {
  const result = await getSupabaseClient().rpc('accept_group_invitation', {
    invitation_id: invitationId,
  });
  if (result.error) throw result.error;
}

export async function declineGroupInvitation(invitationId: string): Promise<void> {
  const result = await getSupabaseClient()
    .from('group_invitations')
    .delete()
    .eq('id', invitationId);
  if (result.error) throw result.error;
}

export async function inviteGroupMember(
  groupId: string,
  invitedBy: string,
  profileId: string,
  kind: GroupMemberKind,
): Promise<void> {
  const result = await getSupabaseClient()
    .from('group_invitations')
    .insert({ group_id: groupId, invited_by: invitedBy, kind, profile_id: profileId });
  if (result.error) throw result.error;
}

export async function cancelGroupInvitation(invitationId: string): Promise<void> {
  return declineGroupInvitation(invitationId);
}

export async function updateGroupMember(
  groupId: string,
  profileId: string,
  input: { kind?: GroupMemberKind; role?: string | null },
): Promise<void> {
  const update: Database['public']['Tables']['group_members']['Update'] = {};
  if (input.kind !== undefined) update.kind = input.kind;
  if (input.role !== undefined) update.role = input.role;
  const result = await getSupabaseClient()
    .from('group_members')
    .update(update)
    .eq('group_id', groupId)
    .eq('profile_id', profileId);
  if (result.error) throw result.error;
}

export async function removeGroupMember(groupId: string, profileId: string): Promise<void> {
  const result = await getSupabaseClient()
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('profile_id', profileId);
  if (result.error) throw result.error;
}

export async function transferGroupLeadership(groupId: string, profileId: string): Promise<void> {
  const result = await getSupabaseClient().rpc('transfer_group_leadership', {
    p_group_id: groupId,
    p_new_leader_id: profileId,
  });
  if (result.error) throw result.error;
}

export async function updateGroupSettings(input: UpdateGroupSettingsInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('group_name_required');
  const result = await getSupabaseClient()
    .from('music_groups')
    .update({
      auto_sos_enabled: input.autoSosEnabled,
      auto_sos_min_level: input.autoSosMinLevel,
      is_public: input.isPublic,
      name,
    })
    .eq('id', input.groupId);
  if (result.error) throw result.error;
}

export async function uploadGroupPhoto(input: UploadGroupPhotoInput): Promise<void> {
  const data = await new File(input.uri).arrayBuffer();
  if (data.byteLength <= 0 || data.byteLength > attachmentMaxBytes)
    throw new Error('group_photo_invalid');
  const supabase = getSupabaseClient();
  const path = `${input.leaderId.toLowerCase()}/group_${input.groupId.toLowerCase()}.jpg`;
  const upload = await supabase.storage.from('avatars').upload(path, data, {
    cacheControl: '3600',
    contentType: input.contentType || 'image/jpeg',
    upsert: true,
  });
  if (upload.error) throw upload.error;
  const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const result = await supabase
    .from('music_groups')
    .update({ photo_url: `${publicUrl}?v=${Date.now()}` })
    .eq('id', input.groupId);
  if (result.error) throw result.error;
}

export async function deleteGroupPhoto(groupId: string, leaderId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const path = `${leaderId.toLowerCase()}/group_${groupId.toLowerCase()}.jpg`;
  const update = await supabase.from('music_groups').update({ photo_url: null }).eq('id', groupId);
  if (update.error) throw update.error;
  await supabase.storage.from('avatars').remove([path]);
}

export async function deleteGroup(groupId: string): Promise<void> {
  const result = await getSupabaseClient().from('music_groups').delete().eq('id', groupId);
  if (result.error) throw result.error;
}

async function uploadGroupMessageAttachment(
  groupId: string,
  senderId: string,
  pending: PendingMessageAttachment,
) {
  const data = await new File(pending.uri).arrayBuffer();
  if (data.byteLength <= 0) throw new Error('group_attachment_unreadable');
  if (data.byteLength > MESSAGE_ATTACHMENT_MAX_BYTES) throw new Error('group_attachment_too_large');
  const extension =
    pending.fileExtension
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 12) || 'dat';
  const path = `group/${groupId.toLowerCase()}/${senderId.toLowerCase()}/${randomUUID().toLowerCase()}.${extension}`;
  const result = await getSupabaseClient()
    .storage.from(messageFilesBucket)
    .upload(path, data, { contentType: pending.contentType, upsert: false });
  if (result.error) throw result.error;
  return {
    name: pending.fileName.slice(0, 255),
    path,
    size: data.byteLength,
    type: pending.contentType,
  };
}

export async function sendGroupMessage(
  groupId: string,
  senderId: string,
  text: string,
  attachment: PendingMessageAttachment | null = null,
): Promise<GroupMessage> {
  if (!groupId || !senderId) throw new Error('group_message_session_required');
  if (!isValidGroupMessage(text, attachment !== null)) throw new Error('group_message_invalid');
  const uploaded = attachment
    ? await uploadGroupMessageAttachment(groupId, senderId, attachment)
    : null;
  const result = await getSupabaseClient()
    .from('group_messages')
    .insert({
      attachment_name: uploaded?.name ?? null,
      attachment_path: uploaded?.path ?? null,
      attachment_size: uploaded?.size ?? null,
      attachment_type: uploaded?.type ?? null,
      group_id: groupId,
      sender_id: senderId,
      text: text.trim(),
    })
    .select(messageColumns)
    .single();
  if (result.error) {
    if (uploaded)
      await getSupabaseClient().storage.from(messageFilesBucket).remove([uploaded.path]);
    throw result.error;
  }
  return groupMessageFromRealtimeRow(result.data as MessageRow, senderId);
}

export async function editGroupMessage(messageId: string, text: string): Promise<void> {
  if (!isValidGroupMessage(text)) throw new Error('group_message_invalid');
  const result = await getSupabaseClient().rpc('edit_group_message', {
    p_message: messageId,
    p_text: text.trim(),
  });
  if (result.error) throw result.error;
}

export async function deleteGroupMessage(messageId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const result = await supabase.rpc('delete_group_message', { p_message: messageId });
  if (result.error) throw result.error;
  if (result.data) await supabase.storage.from(messageFilesBucket).remove([result.data]);
}

export async function setGroupMessageReaction(
  messageId: string,
  emoji: GroupReactionEmoji | null,
): Promise<void> {
  const params = {
    p_emoji: emoji,
    p_message: messageId,
  } as unknown as Database['public']['Functions']['set_group_message_reaction']['Args'];
  const result = await getSupabaseClient().rpc('set_group_message_reaction', params);
  if (result.error) throw result.error;
}

export async function openGroupMessageAttachment(message: GroupMessage): Promise<void> {
  if (!message.attachmentPath) throw new Error('group_attachment_missing');
  const signed = await getSupabaseClient()
    .storage.from(messageFilesBucket)
    .createSignedUrl(message.attachmentPath, 60);
  if (signed.error) throw signed.error;
  await WebBrowser.openBrowserAsync(signed.data.signedUrl);
}

export async function setGroupEventAttendance(
  eventId: string,
  profileId: string,
  status: Exclude<GroupAttendanceStatus, 'pending'>,
): Promise<void> {
  const result = await getSupabaseClient()
    .from('event_attendance')
    .upsert(
      { event_id: eventId, profile_id: profileId, responded_at: new Date().toISOString(), status },
      { onConflict: 'event_id,profile_id' },
    );
  if (result.error) throw result.error;
}

export async function createGroupEvents(groupId: string, draft: GroupEventDraft): Promise<void> {
  const count = Math.max(draft.occurrenceCount, 1);
  const ids = Array.from({ length: count }, () => randomUUID().toLowerCase());
  const seriesId = draft.recurrence === 'Ponctuel' ? null : randomUUID().toLowerCase();
  const payloads = buildEventSavePayloads(draft, ids, seriesId);
  if (payloads.length === 0 || payloads.some((payload) => !payload.id))
    throw new Error('group_event_invalid');
  const result = await getSupabaseClient().rpc('save_group_events_with_locations', {
    p_events: payloads as unknown as Json,
    p_group_id: groupId,
    p_mode: 'create',
  });
  if (result.error) throw result.error;
}

export async function updateGroupEvent(input: UpdateGroupEventInput): Promise<void> {
  const title = input.title.trim();
  const label = groupEventVenueLabel(input);
  const editedDate = new Date(input.date);
  if (
    !title ||
    !input.venue.trim() ||
    !input.postalCode.trim() ||
    !input.city.trim() ||
    Number.isNaN(editedDate.getTime())
  )
    throw new Error('group_event_invalid');
  const exactAddress = input.exactAddress.trim();
  const preserveAddress =
    exactAddress.length === 0 ||
    (input.event.privateLocationState === 'available' &&
      input.event.exactAddress?.trim() === exactAddress);
  const replaceAddress = exactAddress.length > 0 && !preserveAddress;
  const clearAddress = exactAddress.length === 0 && input.clearExactAddress;
  const now = Date.now();
  const targets =
    input.scope === 'futureOccurrences' && input.event.seriesId
      ? input.events
          .filter(
            (event) =>
              event.seriesId === input.event.seriesId &&
              (event.id === input.event.id || new Date(event.date).getTime() > now),
          )
          .sort((left, right) => left.date.localeCompare(right.date))
      : [input.event];
  const effectiveTargets = targets.length > 0 ? targets : [input.event];
  const dateForTarget = (event: GroupEvent): Date => {
    if (event.id === input.event.id || input.scope === 'thisDate') return editedDate;
    const occurrence = new Date(event.date);
    occurrence.setHours(editedDate.getHours(), editedDate.getMinutes(), 0, 0);
    return occurrence;
  };
  const payload = effectiveTargets.map((event) => ({
    city: input.city.trim(),
    clear_exact_address: clearAddress,
    country_code: input.countryCode.trim().toUpperCase() || 'CH',
    date: dateForTarget(event).toISOString(),
    exact_address: replaceAddress ? exactAddress : '',
    id: event.id,
    kind: input.kind ?? event.kind,
    latitude: input.latitude,
    longitude: input.longitude,
    postal_code: input.postalCode.trim(),
    public_location_label: label,
    reminder_lead_days: input.reminderLeadDays,
    series_id: event.seriesId,
    setlist: event.setlist.map(groupSongToJson),
    title,
  }));
  const supabase = getSupabaseClient();
  const saved = await supabase.rpc('save_group_events_with_locations', {
    p_events: payload as unknown as Json,
    p_group_id: input.groupId,
    p_mode: 'update',
  });
  if (saved.error) throw saved.error;
  const targetIds = effectiveTargets.map((event) => event.id);
  const reminder = await supabase
    .from('group_events')
    .update({ reminder_lead_days: input.reminderLeadDays })
    .eq('group_id', input.groupId)
    .in('id', targetIds);
  if (reminder.error) throw reminder.error;
  const changedDayIds = effectiveTargets
    .filter((event) => dateForTarget(event).toDateString() !== new Date(event.date).toDateString())
    .map((event) => event.id);
  if (changedDayIds.length > 0) {
    const reset = await supabase
      .from('event_attendance')
      .delete()
      .in('event_id', changedDayIds)
      .neq('profile_id', input.leaderId);
    if (reset.error) throw reset.error;
  }
  const notified = await supabase.rpc('notify_group_event_moved', {
    p_dates: effectiveTargets.length,
    p_event_id: input.event.id,
  });
  if (notified.error) throw notified.error;
}

export async function cancelGroupEvent(eventIds: string | string[]): Promise<void> {
  const ids = Array.isArray(eventIds) ? [...new Set(eventIds)] : [eventIds];
  if (ids.length === 0) throw new Error('group_event_invalid');
  const result = await getSupabaseClient().rpc('cancel_group_events', { p_event_ids: ids });
  if (result.error) throw result.error;
}

export async function saveGroupRepertoire(
  groupId: string,
  original: readonly GroupSong[],
  desired: readonly GroupSong[],
): Promise<void> {
  const result = await getSupabaseClient().rpc('merge_group_repertoire_snapshot', {
    p_desired_songs: desired.map(groupSongToJson) as unknown as Json,
    p_group_id: groupId,
    p_original_songs: original.map(groupSongToJson) as unknown as Json,
  });
  if (result.error) throw result.error;
}

export async function reorderGroupRepertoire(groupId: string, songIds: string[]): Promise<void> {
  const result = await getSupabaseClient().rpc('reorder_group_repertoire', {
    p_group_id: groupId,
    p_song_ids: songIds,
  });
  if (result.error) throw result.error;
}

export async function saveEventSetlist(
  eventId: string,
  original: readonly GroupSong[],
  desired: readonly GroupSong[],
): Promise<void> {
  const result = await getSupabaseClient().rpc('merge_event_setlist_snapshot', {
    p_desired_songs: desired.map(groupSongToJson) as unknown as Json,
    p_event_id: eventId,
    p_original_songs: original.map(groupSongToJson) as unknown as Json,
  });
  if (result.error) throw result.error;
}

function songCopyErrorStatus(error: unknown): Exclude<GroupSongCopyStatus, 'copied'> {
  if (typeof error !== 'object' || error === null) return 'failed';
  const value = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof value.code === 'string' ? value.code : '';
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : '';
  const status = typeof value.status === 'number' ? value.status : 0;
  if (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    message.includes('permission') ||
    message.includes('membership_required')
  )
    return 'permission-denied';
  if (
    code === 'PGRST116' ||
    code === 'P0002' ||
    message.includes('not_found') ||
    message.includes('0 rows')
  )
    return 'unavailable';
  return 'failed';
}

async function currentSongCopyDestination(
  target: GroupSongCopyTarget,
): Promise<readonly GroupSong[]> {
  const supabase = getSupabaseClient();
  if (target.eventId) {
    const result = await supabase
      .from('group_events')
      .select('group_id,setlist')
      .eq('id', target.eventId)
      .eq('group_id', target.groupId)
      .single();
    if (result.error) throw result.error;
    return groupSongsFromJson(result.data.setlist);
  }
  const result = await supabase
    .from('music_groups')
    .select('id,repertoire')
    .eq('id', target.groupId)
    .single();
  if (result.error) throw result.error;
  return groupSongsFromJson(result.data.repertoire);
}

/**
 * Relit chaque destination avant la fusion atomique. Cette seconde barrière
 * évite qu'un morceau ajouté depuis un autre appareil soit dupliqué à partir
 * d'un cache devenu ancien ; le RPC existant garde la vérification RLS.
 */
export async function copyGroupSongToDestinations(
  targets: readonly GroupSongCopyTarget[],
): Promise<GroupSongCopyResult[]> {
  const uniqueTargets = [
    ...new Map(targets.map((target) => [target.destinationId, target])).values(),
  ];
  const results: GroupSongCopyResult[] = [];
  for (const target of uniqueTargets) {
    try {
      const current = await currentSongCopyDestination(target);
      if (containsGroupSong(current, target.copy)) {
        results.push({ destinationId: target.destinationId, status: 'already-exists' });
        continue;
      }
      if (target.eventId) {
        await saveEventSetlist(target.eventId, current, [...current, target.copy]);
      } else {
        await saveGroupRepertoire(target.groupId, current, [...current, target.copy]);
      }
      results.push({ destinationId: target.destinationId, status: 'copied' });
    } catch (error) {
      results.push({
        destinationId: target.destinationId,
        status: songCopyErrorStatus(error),
      });
    }
  }
  return results;
}

export async function setGroupSongSolos(groupId: string, songId: string, profileIds: string[]) {
  const result = await getSupabaseClient().rpc('set_group_song_solos', {
    p_group_id: groupId,
    p_profile_ids: profileIds,
    p_song_id: songId,
  });
  if (result.error) throw result.error;
}

export async function addSongComment(
  groupId: string,
  songId: string,
  authorId: string,
  text: string,
): Promise<void> {
  const cleaned = text.trim();
  if (!cleaned) throw new Error('group_comment_invalid');
  const result = await getSupabaseClient().from('song_comments').insert({
    author_id: authorId,
    group_id: groupId,
    song_id: songId,
    text: cleaned,
  });
  if (result.error) throw result.error;
}

export async function deleteSongComment(commentId: string): Promise<void> {
  const result = await getSupabaseClient()
    .from('song_comments')
    .delete()
    .eq('id', commentId)
    .select('id')
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error('group_comment_delete_forbidden');
}

function documentContentType(extension: string, declared: string) {
  if (declared) return declared;
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

const allowedGroupDocumentExtensions = new Set(['jpeg', 'jpg', 'pdf', 'png', 'txt']);

export function isAllowedGroupDocumentExtension(extension: string): boolean {
  return allowedGroupDocumentExtensions.has(extension.trim().toLowerCase());
}

export async function uploadGroupDocument(input: UploadGroupDocumentInput): Promise<void> {
  const extension =
    input.extension
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 12) || 'pdf';
  if (!isAllowedGroupDocumentExtension(extension)) throw new Error('group_document_type_invalid');
  const documentId = randomUUID().toLowerCase();
  const path = `${input.groupId.toLowerCase()}/${documentId}.${extension}`;
  const data = await new File(input.uri).arrayBuffer();
  if (data.byteLength <= 0 || data.byteLength > attachmentMaxBytes)
    throw new Error('group_document_invalid');
  const supabase = getSupabaseClient();
  const upload = await supabase.storage.from(groupDocsBucket).upload(path, data, {
    contentType: documentContentType(extension, input.contentType),
    upsert: false,
  });
  if (upload.error) throw upload.error;
  const inserted = await supabase.from('group_docs').insert({
    added_by: input.userId,
    ext: extension,
    group_id: input.groupId,
    id: documentId,
    instrument: input.instrument,
    path,
    song_id: input.songId,
    title: input.title.trim() || i18n.t('Partition'),
  });
  if (inserted.error) {
    await supabase.storage.from(groupDocsBucket).remove([path]);
    throw inserted.error;
  }
}

export async function openGroupDocument(document: GroupDocument): Promise<void> {
  const signed = await getSupabaseClient()
    .storage.from(groupDocsBucket)
    .createSignedUrl(document.path, 60);
  if (signed.error) throw signed.error;
  await openDocumentPreview({
    extension: document.extension,
    signedUrl: signed.data.signedUrl,
    title: document.title,
  });
}

export async function deleteGroupDocument(document: GroupDocument): Promise<void> {
  const supabase = getSupabaseClient();
  const deleted = await supabase.from('group_docs').delete().eq('id', document.id);
  if (deleted.error) throw deleted.error;
  await supabase.storage.from(groupDocsBucket).remove([document.path]);
}

export function subscribeToGroups(userId: string, onChange: () => void): () => void {
  if (!userId) return () => undefined;
  const supabase = getSupabaseClient();
  const tables = [
    'music_groups',
    'group_members',
    'group_invitations',
    'group_events',
    'event_attendance',
    'group_docs',
    'song_comments',
  ] as const;
  let channel = supabase.channel(uniqueRealtimeTopic(`groups:${userId}`));
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export type GroupMessageRealtimeEvent = 'insert' | 'update';

export interface GroupMessageChannelController {
  unsubscribe: () => void;
}

export interface GroupTypingChannelController {
  sendTyping: () => void;
  unsubscribe: () => void;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function equalityFilter(column: string, values: readonly string[]): string {
  return values.length === 1 ? `${column}=eq.${values[0]}` : `${column}=in.(${values.join(',')})`;
}

/**
 * Keeps group rows fresh while their thread is closed. Subscriptions are
 * server-filtered and split at the documented 100-value `in` limit.
 */
export function subscribeToGroupMessageSummaries(
  groupIds: readonly string[],
  userId: string,
  onMessage: (row: MessageRow, event: GroupMessageRealtimeEvent) => void,
): () => void {
  const ids = [...new Set(groupIds.filter(Boolean))].sort();
  if (!userId || ids.length === 0) return () => undefined;
  const supabase = getSupabaseClient();
  let channel = supabase.channel(uniqueRealtimeTopic(`group-message-summaries:${userId}`));
  const handleInsert = (payload: RealtimePostgresInsertPayload<MessageRow>) =>
    onMessage(payload.new, 'insert');
  const handleUpdate = (payload: RealtimePostgresUpdatePayload<MessageRow>) =>
    onMessage(payload.new, 'update');
  for (const batch of chunks(ids, 100)) {
    const filter = equalityFilter('group_id', batch);
    channel = channel
      .on(
        'postgres_changes',
        { event: 'INSERT', filter, schema: 'public', table: 'group_messages' },
        handleInsert,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', filter, schema: 'public', table: 'group_messages' },
        handleUpdate,
      );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * One active group thread: messages are filtered by `group_id`; reactions are
 * filtered by the IDs actually loaded in the paginated cache.
 */
export function subscribeToGroupMessages(
  groupId: string,
  userId: string,
  loadedMessageIds: readonly string[],
  onMessage: (row: MessageRow, event: GroupMessageRealtimeEvent) => void,
  onReaction: (messageId: string) => void,
): GroupMessageChannelController {
  if (!groupId || !userId) return { unsubscribe: () => undefined };
  const supabase = getSupabaseClient();
  const messageFilter = equalityFilter('group_id', [groupId]);
  const handleInsert = (payload: RealtimePostgresInsertPayload<MessageRow>) =>
    onMessage(payload.new, 'insert');
  const handleUpdate = (payload: RealtimePostgresUpdatePayload<MessageRow>) =>
    onMessage(payload.new, 'update');
  const handleReaction = (
    payload:
      RealtimePostgresInsertPayload<ReactionRow> | RealtimePostgresUpdatePayload<ReactionRow>,
  ) => onReaction(payload.new.message_id);
  let channel = supabase
    .channel(uniqueRealtimeTopic(`group-messages-db:${groupId}`))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        filter: messageFilter,
        schema: 'public',
        table: 'group_messages',
      },
      handleInsert,
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        filter: messageFilter,
        schema: 'public',
        table: 'group_messages',
      },
      handleUpdate,
    );
  const messageIds = [...new Set(loadedMessageIds.filter(Boolean))].sort();
  for (const batch of chunks(messageIds, 100)) {
    const filter = equalityFilter('message_id', batch);
    channel = channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          filter,
          schema: 'public',
          table: 'group_message_reactions',
        },
        handleReaction,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          filter,
          schema: 'public',
          table: 'group_message_reactions',
        },
        handleReaction,
      );
  }
  channel.subscribe();
  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}

/** Typing stays on the shared cross-platform topic used by every group member. */
export function subscribeToGroupTyping(
  groupId: string,
  userId: string,
  onMemberTyping: (profileId: string) => void,
): GroupTypingChannelController {
  if (!groupId || !userId) return { sendTyping: () => undefined, unsubscribe: () => undefined };
  const controller = subscribeToRealtimeBroadcast(
    `group-messages:${groupId}`,
    'typing',
    (payload) => {
      if (
        payload &&
        typeof payload === 'object' &&
        'user_id' in payload &&
        typeof payload.user_id === 'string' &&
        payload.user_id !== userId
      )
        onMemberTyping(payload.user_id);
    },
  );
  return {
    sendTyping: () => controller.send({ user_id: userId }),
    unsubscribe: controller.unsubscribe,
  };
}
