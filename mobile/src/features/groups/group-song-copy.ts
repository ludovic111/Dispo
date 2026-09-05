import { randomUUID } from 'expo-crypto';

import type { GroupSong, MusicGroup } from './group-model';

import { normalizeSongText } from '@/domain/song';

export type GroupSongCopyCollection = 'event' | 'repertoire';

export interface GroupSongCopyDestination {
  collection: GroupSongCopyCollection;
  date: string | null;
  eventId: string | null;
  groupId: string;
  groupName: string;
  id: string;
  isAlreadyPresent: boolean;
  isDirect: boolean;
  name: string;
  songs: readonly GroupSong[];
  type: string;
}

export interface GroupSongCopyTarget {
  copy: GroupSong;
  destinationId: string;
  eventId: string | null;
  groupId: string;
}

export type GroupSongCopyStatus =
  'already-exists' | 'copied' | 'failed' | 'permission-denied' | 'unavailable';

export interface GroupSongCopyResult {
  destinationId: string;
  status: GroupSongCopyStatus;
}

function normalizedCatalogId(value: string | null): string | null {
  const cleaned = value?.trim().toLocaleLowerCase('en-US');
  return cleaned || null;
}

function normalizedIsrc(value: string | null): string | null {
  const cleaned = value?.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return cleaned || null;
}

/** Identité canonique, ISRC, identifiant fournisseur, puis titre + artiste. */
export function groupSongsMatch(left: GroupSong, right: GroupSong): boolean {
  const leftCanonicalId = normalizedCatalogId(left.canonicalSongId);
  const rightCanonicalId = normalizedCatalogId(right.canonicalSongId);
  if (leftCanonicalId && rightCanonicalId && leftCanonicalId === rightCanonicalId) return true;
  const leftIsrc = normalizedIsrc(left.isrc);
  const rightIsrc = normalizedIsrc(right.isrc);
  if (leftIsrc && rightIsrc && leftIsrc === rightIsrc) return true;
  const leftCatalogId = normalizedCatalogId(left.catalogId);
  const rightCatalogId = normalizedCatalogId(right.catalogId);
  if (leftCatalogId && rightCatalogId && leftCatalogId === rightCatalogId) return true;
  return (
    normalizeSongText(left.title) === normalizeSongText(right.title) &&
    normalizeSongText(left.artist) === normalizeSongText(right.artist)
  );
}

export function containsGroupSong(songs: readonly GroupSong[], candidate: GroupSong): boolean {
  return songs.some((song) => groupSongsMatch(song, candidate));
}

/**
 * Crée une copie indépendante comme Swift. Toutes les métadonnées musicales
 * suivent ; l'identité, le suggérant, l'approbation et les solos appartiennent
 * à la nouvelle destination.
 */
export function copiedGroupSong(
  source: GroupSong,
  input: { approved: boolean; id?: string; suggestedBy: string },
): GroupSong {
  return {
    ...source,
    genres: [...source.genres],
    id: (input.id ?? randomUUID()).toLowerCase(),
    isApproved: input.approved,
    platformIds: { ...source.platformIds },
    platformLinks: { ...source.platformLinks },
    solos: [],
    ...(source.startsSet === undefined ? {} : { startsSet: false }),
    suggestedBy: input.suggestedBy,
  };
}

function validDate(value: string): string | null {
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function destinationTime(destination: GroupSongCopyDestination): number | null {
  if (!destination.date) return null;
  const value = Date.parse(destination.date);
  return Number.isNaN(value) ? null : value;
}

/**
 * Conserve les événements passés, place toutes les dates dans l'ordre
 * chronologique, puis les événements sans date et enfin les répertoires.
 */
export function sortGroupSongCopyDestinations(
  destinations: readonly GroupSongCopyDestination[],
): GroupSongCopyDestination[] {
  return [...destinations].sort((left, right) => {
    const leftTime = destinationTime(left);
    const rightTime = destinationTime(right);
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime)
      return leftTime - rightTime;
    if (leftTime !== null) return -1;
    if (rightTime !== null) return 1;
    if (left.collection !== right.collection) return left.collection === 'event' ? -1 : 1;
    return (
      left.groupName.localeCompare(right.groupName) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function groupSongCopyDestinations(
  groups: readonly MusicGroup[],
  source: GroupSong,
  input: { sourceEventId: string | null; sourceGroupId: string; userId: string },
): GroupSongCopyDestination[] {
  const destinations = groups.flatMap((group) => {
    const result: GroupSongCopyDestination[] = [];
    if (group.id !== input.sourceGroupId || input.sourceEventId !== null) {
      result.push({
        collection: 'repertoire',
        date: null,
        eventId: null,
        groupId: group.id,
        groupName: group.name,
        id: `group:${group.id.toLowerCase()}`,
        isAlreadyPresent: containsGroupSong(group.repertoire, source),
        isDirect: group.leaderId === input.userId,
        name: group.name,
        songs: group.repertoire,
        type: 'Répertoire',
      });
    }
    for (const event of group.events) {
      if (group.id === input.sourceGroupId && event.id === input.sourceEventId) continue;
      result.push({
        collection: 'event',
        date: validDate(event.date),
        eventId: event.id,
        groupId: group.id,
        groupName: group.name,
        id: `event:${event.id.toLowerCase()}`,
        isAlreadyPresent: containsGroupSong(event.setlist, source),
        isDirect: group.leaderId === input.userId,
        name: event.title,
        songs: event.setlist,
        type: event.kind,
      });
    }
    return result;
  });
  return sortGroupSongCopyDestinations(destinations);
}

export function applyOptimisticSongCopies(
  groups: readonly MusicGroup[],
  targets: readonly GroupSongCopyTarget[],
): MusicGroup[] {
  const byGroup = new Map<string, GroupSongCopyTarget[]>();
  for (const target of targets) {
    const current = byGroup.get(target.groupId) ?? [];
    current.push(target);
    byGroup.set(target.groupId, current);
  }
  return groups.map((group) => {
    const groupTargets = byGroup.get(group.id);
    if (!groupTargets?.length) return group;
    const repertoireCopies = groupTargets.filter((target) => target.eventId === null);
    const eventCopies = groupTargets.filter((target) => target.eventId !== null);
    return {
      ...group,
      events: group.events.map((event) => ({
        ...event,
        setlist: [
          ...event.setlist,
          ...eventCopies
            .filter((target) => target.eventId === event.id)
            .map((target) => target.copy),
        ],
      })),
      repertoire: [...group.repertoire, ...repertoireCopies.map((target) => target.copy)],
    };
  });
}

export function removeOptimisticSongCopies(
  groups: readonly MusicGroup[],
  targets: readonly GroupSongCopyTarget[],
): MusicGroup[] {
  const ids = new Set(targets.map((target) => target.copy.id));
  if (!ids.size) return [...groups];
  return groups.map((group) => ({
    ...group,
    events: group.events.map((event) => ({
      ...event,
      setlist: event.setlist.filter((song) => !ids.has(song.id)),
    })),
    repertoire: group.repertoire.filter((song) => !ids.has(song.id)),
  }));
}
