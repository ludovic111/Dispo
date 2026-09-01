import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadSosScope,
  saveSosScope,
  sosScopeStorageKey,
  sosShowAllStorageKey,
} from '@/features/gigs/gig-preferences';
import { legacySosShowAllKey } from '@/services/storage/legacy-native-preferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('SOS feed preference continuity', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps the preference isolated per account', async () => {
    await saveSosScope('user-a', 'school');

    await expect(loadSosScope('user-a')).resolves.toBe('school');
    await expect(loadSosScope('user-b')).resolves.toBe('matching');
  });

  it('migrates the previous per-account boolean preference', async () => {
    await AsyncStorage.setItem(sosShowAllStorageKey('user-a'), 'true');

    await expect(loadSosScope('user-a')).resolves.toBe('all');
    await expect(AsyncStorage.getItem(sosScopeStorageKey('user-a'))).resolves.toBe('all');
  });

  it('consumes the previous Swift global preference only once', async () => {
    await AsyncStorage.setItem(legacySosShowAllKey, 'true');

    await expect(loadSosScope('user-a')).resolves.toBe('all');
    await expect(AsyncStorage.getItem(sosScopeStorageKey('user-a'))).resolves.toBe('all');
    await expect(AsyncStorage.getItem(legacySosShowAllKey)).resolves.toBeNull();
    await expect(loadSosScope('user-b')).resolves.toBe('matching');
  });
});
