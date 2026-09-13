import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GigViewerMatch } from './gig-model';

import { legacyOpenedGigIdsKey } from '@/services/storage/legacy-native-preferences';

const storagePrefix = '@dispo/gigs/opened/v1';
const openedListeners = new Set<(userId: string, gigId: string) => void>();

export function openedGigsStorageKey(userId: string): string {
  if (!userId.trim()) throw new Error('gig_opened_user_missing');
  return `${storagePrefix}/${encodeURIComponent(userId.trim())}`;
}

function decodeOpenedIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((value): value is string => typeof value === 'string' && Boolean(value)),
    );
  } catch {
    return new Set();
  }
}

export async function readOpenedGigIds(userId: string): Promise<Set<string>> {
  const key = openedGigsStorageKey(userId);
  const stored = await AsyncStorage.multiGet([key, legacyOpenedGigIdsKey]);
  const raw = stored[0]?.[1] ?? null;
  const legacyRaw = stored[1]?.[1] ?? null;
  const opened = decodeOpenedIds(raw);
  const legacy = decodeOpenedIds(legacyRaw);
  if (legacy.size === 0) return opened;

  for (const gigId of legacy) opened.add(gigId);
  await AsyncStorage.multiSet([[key, JSON.stringify([...opened].sort())]]);
  // The Swift value was global. Attribute it exactly once to the first
  // authenticated profile, then remove the staging value so accounts cannot
  // inherit one another's read state.
  await AsyncStorage.removeItem(legacyOpenedGigIdsKey);
  return opened;
}

export async function markGigOpened(userId: string, gigId: string): Promise<void> {
  if (!gigId.trim()) return;
  const key = openedGigsStorageKey(userId);
  const opened = decodeOpenedIds(await AsyncStorage.getItem(key));
  if (opened.has(gigId)) return;
  opened.add(gigId);
  await AsyncStorage.setItem(key, JSON.stringify([...opened].sort()));
  for (const listener of openedListeners) listener(userId, gigId);
}

export function subscribeToOpenedGigs(
  listener: (userId: string, gigId: string) => void,
): () => void {
  openedListeners.add(listener);
  return () => openedListeners.delete(listener);
}

/** Annonces compatibles (serveur) jamais ouvertes : puce de l'onglet SOS et du segment. */
export function countUnopenedMatchedGigs(
  matches: readonly GigViewerMatch[],
  viewerId: string,
  openedIds: ReadonlySet<string>,
  now = new Date(),
): number {
  const seen = new Set<string>();
  return matches.reduce((count, item) => {
    if (seen.has(item.gigId)) return count;
    seen.add(item.gigId);
    const date = new Date(item.date);
    if (
      item.hostId === viewerId ||
      item.targetId !== null ||
      openedIds.has(item.gigId) ||
      item.match.instruments.length === 0 ||
      Number.isNaN(date.getTime()) ||
      date.getTime() <= now.getTime()
    ) {
      return count;
    }
    return count + 1;
  }, 0);
}
