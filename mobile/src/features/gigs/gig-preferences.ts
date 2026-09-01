import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SosFeedScope } from '@/features/gigs/gig-model';
import { legacySosShowAllKey } from '@/services/storage/legacy-native-preferences';

const sosShowAllPrefix = '@dispo/sos/show-all/v1';
const sosScopePrefix = '@dispo/sos/scope/v2';

export function sosShowAllStorageKey(userId: string): string {
  if (!userId.trim()) throw new Error('sos_preferences_user_missing');
  return `${sosShowAllPrefix}/${encodeURIComponent(userId.trim())}`;
}

function decodeBoolean(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function decodeScope(value: string | null): SosFeedScope | null {
  return value === 'matching' || value === 'school' || value === 'all' ? value : null;
}

export function sosScopeStorageKey(userId: string): string {
  if (!userId.trim()) throw new Error('sos_preferences_user_missing');
  return `${sosScopePrefix}/${encodeURIComponent(userId.trim())}`;
}

export async function loadSosScope(userId: string): Promise<SosFeedScope> {
  const scopeKey = sosScopeStorageKey(userId);
  const storedScope = decodeScope(await AsyncStorage.getItem(scopeKey));
  if (storedScope) return storedScope;

  const showAllKey = sosShowAllStorageKey(userId);
  const storedShowAll = decodeBoolean(await AsyncStorage.getItem(showAllKey));
  if (storedShowAll !== null) {
    const migratedScope = storedShowAll ? 'all' : 'matching';
    await AsyncStorage.setItem(scopeKey, migratedScope);
    return migratedScope;
  }

  // The Swift client stored this preference globally. Consume it once into
  // the currently authenticated profile so it cannot leak to another account.
  const legacy = decodeBoolean(await AsyncStorage.getItem(legacySosShowAllKey));
  if (legacy === null) return 'matching';
  const migratedScope = legacy ? 'all' : 'matching';
  await AsyncStorage.setItem(scopeKey, migratedScope);
  await AsyncStorage.removeItem(legacySosShowAllKey);
  return migratedScope;
}

export async function saveSosScope(userId: string, scope: SosFeedScope): Promise<void> {
  await AsyncStorage.setItem(sosScopeStorageKey(userId), scope);
}
