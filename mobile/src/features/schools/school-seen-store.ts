import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SchoolCommunity } from './school-model';

import { legacySchoolLastSeenKey } from '@/services/storage/legacy-native-preferences';

export type SchoolSeenMap = Record<string, string>;

function storageKey(userId: string) {
  return `dispo.schools.lastSeen.v1:${userId}`;
}

function parseSeen(raw: string | null): SchoolSeenMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

export async function loadAndSeedSchoolSeen(
  userId: string,
  schoolIds: readonly string[],
  now = new Date(),
): Promise<SchoolSeenMap> {
  if (!userId) return {};
  const key = storageKey(userId);
  const stored = await AsyncStorage.multiGet([key, legacySchoolLastSeenKey]);
  const current = parseSeen(stored[0]?.[1] ?? null);
  const legacy = parseSeen(stored[1]?.[1] ?? null);
  const next = { ...current };
  let changed = Object.keys(legacy).length > 0;
  for (const [schoolId, timestamp] of Object.entries(legacy)) {
    if (!next[schoolId]) next[schoolId] = timestamp;
  }
  for (const schoolId of schoolIds) {
    if (next[schoolId]) continue;
    next[schoolId] = now.toISOString();
    changed = true;
  }
  if (changed) await AsyncStorage.setItem(key, JSON.stringify(next));
  if (Object.keys(legacy).length > 0) {
    // The Swift value was app-global. Attribute it only to the first account
    // authenticated after the upgrade, exactly like the group continuity.
    await AsyncStorage.removeItem(legacySchoolLastSeenKey);
  }
  return next;
}

export async function markSchoolSeen(
  userId: string,
  schoolId: string,
  at = new Date(),
): Promise<SchoolSeenMap> {
  if (!userId || !schoolId) return {};
  const current = parseSeen(await AsyncStorage.getItem(storageKey(userId)));
  const next = { ...current, [schoolId]: at.toISOString() };
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}

export function unreadSchoolMessageCount(
  community: SchoolCommunity,
  userId: string,
  seen: SchoolSeenMap,
): number {
  const lastSeen = seen[community.affiliation.school.id];
  if (!lastSeen) return 0;
  return community.messages.filter(
    (message) =>
      message.senderId !== userId && message.deletedAt === null && message.createdAt > lastSeen,
  ).length;
}

export function totalSchoolUnread(
  communities: readonly SchoolCommunity[],
  userId: string,
  seen: SchoolSeenMap,
): number {
  return communities.reduce(
    (total, community) => total + unreadSchoolMessageCount(community, userId, seen),
    0,
  );
}
