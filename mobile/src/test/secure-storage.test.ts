import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import DispoLegacyPreferencesModule from '../../modules/dispo-legacy-preferences/src/DispoLegacyPreferencesModule';

import {
  isSupabaseSessionPayload,
  migrateNativeAndroidSessionPayload,
  migrateNativeSwiftSessionPayload,
  secureSessionStorage,
  splitSecureValue,
} from '@/services/storage/secure-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 1,
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('../../modules/dispo-legacy-preferences/src/DispoLegacyPreferencesModule', () => ({
  __esModule: true,
  default: { readSupabaseSessionAsync: jest.fn() },
}));

const originalPlatform = Platform.OS;
function setPlatform(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

describe('stockage chiffré découpé', () => {
  beforeEach(() => {
    setPlatform('ios');
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue();
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
    jest
      .mocked(DispoLegacyPreferencesModule?.readSupabaseSessionAsync as () => string | null)
      .mockReturnValue(null);
  });

  afterAll(() => setPlatform(originalPlatform === 'android' ? 'android' : 'ios'));

  it('conserve exactement les contenus longs dans l’ordre', () => {
    const value = 'session:'.repeat(800);
    const chunks = splitSecureValue(value, 257);

    expect(chunks.every((chunk) => chunk.length <= 257)).toBe(true);
    expect(chunks.join('')).toBe(value);
  });

  it('représente aussi une valeur vide et refuse une taille invalide', () => {
    expect(splitSecureValue('', 8)).toEqual(['']);
    expect(() => splitSecureValue('x', 0)).toThrow('secure_storage_invalid_chunk_size');
  });

  it('ne migre que les sessions Supabase Swift complètes', () => {
    expect(
      isSupabaseSessionPayload(
        JSON.stringify({ access_token: 'access', refresh_token: 'refresh', user: { id: 'id' } }),
      ),
    ).toBe(true);
    expect(isSupabaseSessionPayload(JSON.stringify({ access_token: 'access', user: {} }))).toBe(
      false,
    );
    expect(isSupabaseSessionPayload('not-json')).toBe(false);
  });

  it('convertit le codage camelCase Supabase Swift vers le format GoTrue JavaScript', () => {
    const migrated = migrateNativeSwiftSessionPayload(
      JSON.stringify({
        accessToken: 'access',
        expiresAt: 1_777_777_777,
        expiresIn: 3600,
        refreshToken: 'refresh',
        tokenType: 'bearer',
        user: {
          appMetadata: { customClaim: 'preserved' },
          createdAt: 809_870_400,
          id: 'id',
          identities: [
            {
              identityData: { customField: 'preserved' },
              identityId: 'identity-id',
              userId: 'id',
            },
          ],
          userMetadata: { fullName: 'Ludovic Marie' },
        },
      }),
    );

    expect(JSON.parse(migrated ?? '')).toEqual({
      access_token: 'access',
      expires_at: 1_777_777_777,
      expires_in: 3600,
      refresh_token: 'refresh',
      token_type: 'bearer',
      user: {
        app_metadata: { customClaim: 'preserved' },
        created_at: '2026-08-31T12:00:00.000Z',
        id: 'id',
        identities: [
          {
            identity_data: { customField: 'preserved' },
            identity_id: 'identity-id',
            user_id: 'id',
          },
        ],
        user_metadata: { fullName: 'Ludovic Marie' },
      },
    });
  });

  it('convertit la session Supabase-KT et son expiresAt ISO vers un epoch GoTrue', () => {
    const migrated = migrateNativeAndroidSessionPayload(
      JSON.stringify({
        accessToken: 'access',
        expiresAt: '2099-01-01T00:00:00Z',
        expiresIn: 3600,
        refreshToken: 'refresh',
        tokenType: 'bearer',
        user: {
          appMetadata: { provider: 'email' },
          createdAt: '2026-08-31T12:00:00Z',
          id: 'id',
          userMetadata: { name: 'Ludovic' },
        },
      }),
    );

    expect(JSON.parse(migrated ?? '')).toEqual({
      access_token: 'access',
      expires_at: 4_070_908_800,
      expires_in: 3600,
      refresh_token: 'refresh',
      token_type: 'bearer',
      user: {
        app_metadata: { provider: 'email' },
        created_at: '2026-08-31T12:00:00.000Z',
        id: 'id',
        user_metadata: { name: 'Ludovic' },
      },
    });
    expect(
      migrateNativeAndroidSessionPayload(
        JSON.stringify({
          accessToken: 'access',
          expiresAt: 'invalid',
          refreshToken: 'refresh',
          user: { id: 'id' },
        }),
      ),
    ).toBeNull();
  });

  it('produit une session que le client GoTrue JavaScript restaure réellement', async () => {
    const accessToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6ImlkIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.' +
      'signature';
    const migrated = migrateNativeSwiftSessionPayload(
      JSON.stringify({
        accessToken,
        expiresAt: 4_102_444_800,
        expiresIn: 3600,
        refreshToken: 'refresh',
        tokenType: 'bearer',
        user: {
          appMetadata: { provider: 'email' },
          aud: 'authenticated',
          createdAt: 809_870_400,
          id: '00000000-0000-4000-8000-000000000001',
          userMetadata: { name: 'Ludovic' },
        },
      }),
    );
    expect(migrated).not.toBeNull();
    const client = createClient('https://example.supabase.co', 'public-test-key', {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        storage: {
          getItem: async () => migrated,
          removeItem: async () => undefined,
          setItem: async () => undefined,
        },
      },
    });

    const { data, error } = await client.auth.getSession();
    expect(error).toBeNull();
    expect(data.session?.access_token).toBe(accessToken);
    expect(data.session?.user.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(data.session?.user.created_at).toBe('2026-08-31T12:00:00.000Z');
  });

  it('reprend une session Keychain Swift sans casser un retour à l’ancienne app', async () => {
    const session = JSON.stringify({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'id' },
    });
    const expected = JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
      user: { id: 'id' },
    });
    const getItem = SecureStore.getItemAsync as jest.MockedFunction<
      typeof SecureStore.getItemAsync
    >;
    getItem.mockImplementation(async (key, options) => {
      if (key === 'supabase.auth.token' && options?.keychainService === 'supabase.gotrue.swift') {
        return session;
      }
      return null;
    });
    await AsyncStorage.clear();

    await expect(secureSessionStorage.getItem('sb-project-auth-token')).resolves.toBe(expected);
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'dispo.native-swift-session-migrated.v1',
      'complete',
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK },
    );
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('supabase.auth.token', {
      keychainService: 'supabase.gotrue.swift',
    });
  });

  it('reprend la session SharedPreferences Kotlin après validation sans la consommer', async () => {
    setPlatform('android');
    const session = JSON.stringify({
      accessToken: 'access',
      expiresAt: '2099-01-01T00:00:00Z',
      refreshToken: 'refresh',
      user: { id: 'id' },
    });
    const readNative = jest.mocked(
      DispoLegacyPreferencesModule?.readSupabaseSessionAsync as () => string | null,
    );
    readNative.mockReturnValue(session);
    await AsyncStorage.clear();

    const migrated = await secureSessionStorage.getItem('sb-project-auth-token');

    expect(JSON.parse(migrated ?? '')).toMatchObject({
      access_token: 'access',
      expires_at: 4_070_908_800,
      refresh_token: 'refresh',
      user: { id: 'id' },
    });
    expect(readNative).toHaveBeenCalledTimes(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'dispo.native-android-session-migrated.v1',
      'complete',
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK },
    );
  });
});
