import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import DispoLegacyPreferencesModule from '../../../modules/dispo-legacy-preferences/src/DispoLegacyPreferencesModule';

const chunkSize = 1800;
const nativeSupabaseSessionKey = 'supabase.auth.token';
const nativeSupabaseKeychainOptions = { keychainService: 'supabase.gotrue.swift' } as const;
const nativeSupabaseMigrationMarker = 'dispo.native-swift-session-migrated.v1';
const nativeAndroidSupabaseMigrationMarker = 'dispo.native-android-session-migrated.v1';
const appleReferenceDateUnixOffset = 978_307_200;

export function splitSecureValue(value: string, size = chunkSize): string[] {
  if (size < 1) throw new Error('secure_storage_invalid_chunk_size');
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += size) {
    chunks.push(value.slice(offset, offset + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

function secureKey(key: string): string {
  return `dispo.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function normalizeSwiftSessionValue(
  value: unknown,
  preserveMetadata = false,
  insideUser = false,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => normalizeSwiftSessionValue(item, preserveMetadata, insideUser));
  if (!value || typeof value !== 'object') return value;
  if (preserveMetadata) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const normalizedKey = camelToSnake(key);
      const isMetadata = ['app_metadata', 'identity_data', 'user_metadata'].includes(normalizedKey);
      const isUserValue = insideUser || normalizedKey === 'user';
      if (
        isUserValue &&
        normalizedKey.endsWith('_at') &&
        typeof child === 'number' &&
        Number.isFinite(child)
      ) {
        return [
          normalizedKey,
          new Date((child + appleReferenceDateUnixOffset) * 1000).toISOString(),
        ];
      }
      return [normalizedKey, normalizeSwiftSessionValue(child, isMetadata, isUserValue)];
    }),
  );
}

export function migrateNativeSwiftSessionPayload(value: string): string | null {
  try {
    const decoded = JSON.parse(value) as unknown;
    const payload = normalizeSwiftSessionValue(decoded) as Record<string, unknown>;
    const isComplete =
      typeof payload.access_token === 'string' &&
      payload.access_token.length > 0 &&
      typeof payload.refresh_token === 'string' &&
      payload.refresh_token.length > 0 &&
      typeof payload.user === 'object' &&
      payload.user !== null;
    return isComplete ? JSON.stringify(payload) : null;
  } catch {
    return null;
  }
}

function normalizeAndroidSessionValue(
  value: unknown,
  preserveMetadata = false,
  insideUser = false,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => normalizeAndroidSessionValue(item, preserveMetadata, insideUser));
  if (!value || typeof value !== 'object') return value;
  if (preserveMetadata) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const normalizedKey = camelToSnake(key);
      const isMetadata = ['app_metadata', 'identity_data', 'user_metadata'].includes(normalizedKey);
      const isUserValue = insideUser || normalizedKey === 'user';
      if (isUserValue && normalizedKey.endsWith('_at') && typeof child === 'string') {
        const timestamp = Date.parse(child);
        if (!Number.isNaN(timestamp)) return [normalizedKey, new Date(timestamp).toISOString()];
      }
      return [normalizedKey, normalizeAndroidSessionValue(child, isMetadata, isUserValue)];
    }),
  );
}

export function migrateNativeAndroidSessionPayload(value: string): string | null {
  try {
    const decoded = JSON.parse(value) as unknown;
    const payload = normalizeAndroidSessionValue(decoded) as Record<string, unknown>;
    const rawExpiresAt = payload.expires_at;
    if (typeof rawExpiresAt === 'string') {
      const timestamp = Date.parse(rawExpiresAt);
      if (Number.isNaN(timestamp)) return null;
      payload.expires_at = Math.floor(timestamp / 1000);
    } else if (
      typeof rawExpiresAt !== 'number' ||
      !Number.isFinite(rawExpiresAt) ||
      rawExpiresAt <= 0
    ) {
      return null;
    }
    const isComplete =
      typeof payload.access_token === 'string' &&
      payload.access_token.length > 0 &&
      typeof payload.refresh_token === 'string' &&
      payload.refresh_token.length > 0 &&
      typeof payload.user === 'object' &&
      payload.user !== null;
    return isComplete ? JSON.stringify(payload) : null;
  } catch {
    return null;
  }
}

export function isSupabaseSessionPayload(value: string): boolean {
  return migrateNativeSwiftSessionPayload(value) !== null;
}

async function removeSecureValue(key: string): Promise<void> {
  const root = secureKey(key);
  const rawCount = await SecureStore.getItemAsync(`${root}.count`);
  const count = Number(rawCount);
  if (Number.isInteger(count) && count > 0 && count < 64) {
    await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${root}.${index}`)),
    );
  }
  await SecureStore.deleteItemAsync(`${root}.count`);
}

async function writeSecureValue(key: string, value: string): Promise<void> {
  await removeSecureValue(key);
  const root = secureKey(key);
  const chunks = splitSecureValue(value);
  await Promise.all(
    chunks.map((chunk, index) =>
      SecureStore.setItemAsync(`${root}.${index}`, chunk, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      }),
    ),
  );
  await SecureStore.setItemAsync(`${root}.count`, String(chunks.length), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

async function migrateNativeSwiftSession(key: string): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  if (await SecureStore.getItemAsync(nativeSupabaseMigrationMarker).catch(() => null)) return null;
  const nativeSession = await SecureStore.getItemAsync(
    nativeSupabaseSessionKey,
    nativeSupabaseKeychainOptions,
  ).catch(() => null);
  if (!nativeSession) return null;
  const migrated = migrateNativeSwiftSessionPayload(nativeSession);
  if (!migrated) return null;
  await writeSecureValue(key, migrated);
  // Keep the old Keychain item intact so a safe rollback to the Swift client
  // remains possible, but mark it consumed to prevent a logout from importing
  // the stale session again.
  await SecureStore.setItemAsync(nativeSupabaseMigrationMarker, 'complete', {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return migrated;
}

async function migrateNativeAndroidSession(key: string): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (await SecureStore.getItemAsync(nativeAndroidSupabaseMigrationMarker).catch(() => null)) {
    return null;
  }
  let nativeSession: string | null = null;
  try {
    nativeSession = DispoLegacyPreferencesModule?.readSupabaseSessionAsync?.() ?? null;
  } catch {
    return null;
  }
  if (!nativeSession) return null;
  const migrated = migrateNativeAndroidSessionPayload(nativeSession);
  if (!migrated) return null;
  await writeSecureValue(key, migrated);
  // Keep the Supabase-KT SharedPreferences value intact for a safe rollback.
  // Mark it consumed only after the validated payload is durably copied.
  await SecureStore.setItemAsync(nativeAndroidSupabaseMigrationMarker, 'complete', {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return migrated;
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const root = secureKey(key);
    const rawCount = await SecureStore.getItemAsync(`${root}.count`);
    const count = Number(rawCount);
    if (Number.isInteger(count) && count > 0 && count < 64) {
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${root}.${index}`)),
      );
      if (chunks.every((chunk): chunk is string => chunk !== null)) return chunks.join('');
      await removeSecureValue(key);
    }

    // Migration unique de l'ancien stockage non chiffré utilisé par le socle.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await this.setItem(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return (await migrateNativeSwiftSession(key)) ?? migrateNativeAndroidSession(key);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }
    await Promise.all([removeSecureValue(key), AsyncStorage.removeItem(key)]);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await writeSecureValue(key, value);
  },
};
