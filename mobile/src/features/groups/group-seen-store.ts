import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MusicGroup } from './group-model';

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

export async function loadAndSeedGroupSeen(
  userId: string,
  groupIds: readonly string[],
  now = new Date(),
): Promise<GroupSeenMap> {
  if (!userId) return {};
  const current = parseSeen(await AsyncStorage.getItem(storageKey(userId)));
  let changed = false;
  const next = { ...current };
  for (const groupId of groupIds) {
    if (next[groupId]) continue;
    next[groupId] = now.toISOString();
    changed = true;
  }
  if (changed) await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
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
