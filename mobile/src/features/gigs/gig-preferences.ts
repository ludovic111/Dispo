import AsyncStorage from '@react-native-async-storage/async-storage';

import { legacySosShowAllKey } from '@/services/storage/legacy-native-preferences';

const sosShowAllPrefix = '@dispo/sos/show-all/v1';

export function sosShowAllStorageKey(userId: string): string {
  if (!userId.trim()) throw new Error('sos_preferences_user_missing');
  return `${sosShowAllPrefix}/${encodeURIComponent(userId.trim())}`;
}

function decodeBoolean(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export async function loadSosShowAll(userId: string): Promise<boolean> {
  const key = sosShowAllStorageKey(userId);
  const stored = decodeBoolean(await AsyncStorage.getItem(key));
  if (stored !== null) return stored;

  // The Swift client stored this preference globally. Consume it once into
  // the currently authenticated profile so it cannot leak to another account.
  const legacy = decodeBoolean(await AsyncStorage.getItem(legacySosShowAllKey));
  if (legacy === null) return false;
  await AsyncStorage.multiSet([[key, legacy ? 'true' : 'false']]);
  await AsyncStorage.removeItem(legacySosShowAllKey);
  return legacy;
}

export async function saveSosShowAll(userId: string, showAll: boolean): Promise<void> {
  await AsyncStorage.setItem(sosShowAllStorageKey(userId), showAll ? 'true' : 'false');
}
