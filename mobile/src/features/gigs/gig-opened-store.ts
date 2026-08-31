import AsyncStorage from '@react-native-async-storage/async-storage';

import { openGigInstruments, type GigSummary } from './gig-model';

import { legacyOpenedGigIdsKey } from '@/services/storage/legacy-native-preferences';

const storagePrefix = '@dispo/gigs/opened/v1';
const openedListeners = new Set<(userId: string, gigId: string) => void>();

// The badge renders 99+ and must never scan an unbounded active feed. Five
// server pages cover up to 500 upcoming SOS while keeping the tab lightweight.
export const SOS_BADGE_PAGE_SIZE = 100;
export const SOS_BADGE_MAX_PAGES = 5;

export function shouldFetchNextSosBadgePage(
  completedPages: number,
  nextPage: number | null,
): nextPage is number {
  return nextPage !== null && completedPages < SOS_BADGE_MAX_PAGES;
}

export interface GigBadgeViewer {
  id: string;
  instrumentLevels: Record<string, string> | null;
  instruments: string[];
  level: string;
}

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

export function gigMatchesBadgeViewer(gig: GigSummary, viewer: GigBadgeViewer): boolean {
  const open = openGigInstruments(gig);
  if (open.length === 0) return false;
  if (viewer.instruments.length === 0) return true;
  const own = new Set(viewer.instruments);
  const playable = open.filter((instrument) => own.has(instrument));
  if (playable.length === 0) return false;
  if (gig.wantedLevels.length === 0) return true;
  return playable.some((instrument) => {
    const level = viewer.instrumentLevels?.[instrument] ?? viewer.level;
    return gig.wantedLevels.includes(level);
  });
}

export function countUnopenedCompatibleGigs(
  gigs: GigSummary[],
  viewer: GigBadgeViewer,
  openedIds: ReadonlySet<string>,
  now = new Date(),
): number {
  const seen = new Set<string>();
  return gigs.reduce((count, gig) => {
    if (seen.has(gig.id)) return count;
    seen.add(gig.id);
    const date = new Date(gig.date);
    if (
      gig.hostId === viewer.id ||
      gig.targetId !== null ||
      openedIds.has(gig.id) ||
      Number.isNaN(date.getTime()) ||
      date.getTime() <= now.getTime() ||
      !gigMatchesBadgeViewer(gig, viewer)
    ) {
      return count;
    }
    return count + 1;
  }, 0);
}
