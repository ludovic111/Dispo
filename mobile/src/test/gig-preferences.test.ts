import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadSosShowAll,
  saveSosShowAll,
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
    await saveSosShowAll('user-a', true);

    await expect(loadSosShowAll('user-a')).resolves.toBe(true);
    await expect(loadSosShowAll('user-b')).resolves.toBe(false);
  });

  it('consumes the previous Swift global preference only once', async () => {
    await AsyncStorage.setItem(legacySosShowAllKey, 'true');

    await expect(loadSosShowAll('user-a')).resolves.toBe(true);
    await expect(AsyncStorage.getItem(sosShowAllStorageKey('user-a'))).resolves.toBe('true');
    await expect(AsyncStorage.getItem(legacySosShowAllKey)).resolves.toBeNull();
    await expect(loadSosShowAll('user-b')).resolves.toBe(false);
  });
});
