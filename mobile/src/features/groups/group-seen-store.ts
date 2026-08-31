import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MusicGroup } from './group-model';

import {
  legacyAndroidGroupLastSeenByProfileKey,
  legacyGroupLastSeenKey,
} from '@/services/storage/legacy-native-preferences';

export type GroupSeenMap = Record<string, string>;

function storageKey(userId: string) {
  return `dispo.groups.lastSeen.v1:${userId}`;
}

function parseSeen(raw: string | null): GroupSeenMap {
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

function parseSeenByProfile(raw: string | null): Record<string, GroupSeenMap> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([profileId, seen]) => {
        if (!profileId || typeof seen !== 'object' || seen === null || Array.isArray(seen)) {
          return [];
        }
        return [[profileId, parseSeen(JSON.stringify(seen))]];
      }),
    );
  } catch {
    return {};
  }
}

export async function loadAndSeedGroupSeen(
  userId: string,
  groupIds: readonly string[],
  now = new Date(),
): Promise<GroupSeenMap> {
  if (!userId) return {};
  const key = storageKey(userId);
  const stored = await AsyncStorage.multiGet([
    key,
    legacyGroupLastSeenKey,
    legacyAndroidGroupLastSeenByProfileKey,
  ]);
  const currentRaw = stored[0]?.[1] ?? null;
  const swiftLegacyRaw = stored[1]?.[1] ?? null;
  const androidLegacyRaw = stored[2]?.[1] ?? null;
  const current = parseSeen(currentRaw);
  const swiftLegacy = parseSeen(swiftLegacyRaw);
  const androidProfiles = parseSeenByProfile(androidLegacyRaw);
  const androidLegacy = androidProfiles[userId] ?? {};
  const legacy = { ...swiftLegacy, ...androidLegacy };
  let changed = Object.keys(legacy).length > 0;
  const next = { ...current };
  for (const [groupId, timestamp] of Object.entries(legacy)) {
    if (!next[groupId]) next[groupId] = timestamp;
  }
  for (const groupId of groupIds) {
    if (next[groupId]) continue;
    next[groupId] = now.toISOString();
    changed = true;
  }
  if (changed) await AsyncStorage.setItem(key, JSON.stringify(next));
  if (Object.keys(swiftLegacy).length > 0) {
    // Match the native global value to one authenticated profile only.
    await AsyncStorage.removeItem(legacyGroupLastSeenKey);
  }
  if (Object.keys(androidLegacy).length > 0) {
    const remainingProfiles = { ...androidProfiles };
    delete remainingProfiles[userId];
    if (Object.keys(remainingProfiles).length > 0) {
      await AsyncStorage.setItem(
        legacyAndroidGroupLastSeenByProfileKey,
        JSON.stringify(remainingProfiles),
      );
    } else {
      await AsyncStorage.removeItem(legacyAndroidGroupLastSeenByProfileKey);
    }
  }
  return next;
}

export async function markGroupSeen(
  userId: string,
  groupId: string,
  at = new Date(),
): Promise<GroupSeenMap> {
  if (!userId || !groupId) return {};
  const current = parseSeen(await AsyncStorage.getItem(storageKey(userId)));
  const next = { ...current, [groupId]: at.toISOString() };
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}

export function unreadGroupMessageCount(
  group: MusicGroup,
  userId: string,
  seen: GroupSeenMap,
): number {
  const lastSeen = seen[group.id];
  if (!lastSeen) return 0;
  return group.messages.filter(
    (message) =>
      message.senderId !== userId && message.deletedAt === null && message.createdAt > lastSeen,
  ).length;
}

export function totalGroupUnread(
  groups: readonly MusicGroup[],
  userId: string,
  seen: GroupSeenMap,
): number {
  return groups.reduce((total, group) => total + unreadGroupMessageCount(group, userId, seen), 0);
}
