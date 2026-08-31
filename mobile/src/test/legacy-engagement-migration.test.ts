import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { openedGigsStorageKey, readOpenedGigIds } from '@/features/gigs/gig-opened-store';
import { loadAndSeedGroupSeen } from '@/features/groups/group-seen-store';
import { loadAndSeedSchoolSeen } from '@/features/schools/school-seen-store';
import {
  legacyAndroidGroupLastSeenByProfileKey,
  legacyGroupLastSeenKey,
  legacyOpenedGigIdsKey,
  legacySchoolLastSeenKey,
} from '@/services/storage/legacy-native-preferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('legacy native engagement migration', () => {
  it('merges Swift opened SOS once into the first authenticated profile', async () => {
    await AsyncStorage.multiSet([
      [openedGigsStorageKey('profile-a'), JSON.stringify(['expo-gig'])],
      [legacyOpenedGigIdsKey, JSON.stringify(['native-gig', 'expo-gig'])],
    ]);

    await expect(readOpenedGigIds('profile-a')).resolves.toEqual(
      new Set(['expo-gig', 'native-gig']),
    );
    expect(await AsyncStorage.getItem(legacyOpenedGigIdsKey)).toBeNull();
    await expect(readOpenedGigIds('profile-b')).resolves.toEqual(new Set());
  });

  it('attribue les lectures d’école Swift à un seul compte sans écraser Expo', async () => {
    await AsyncStorage.multiSet([
      [
        'dispo.schools.lastSeen.v1:profile-a',
        JSON.stringify({ shared: '2026-08-31T21:00:00.000Z' }),
      ],
      [
        legacySchoolLastSeenKey,
        JSON.stringify({ native: '2026-08-30T20:00:00.000Z', shared: '2026-08-29T18:00:00.000Z' }),
      ],
    ]);

    await expect(
      loadAndSeedSchoolSeen(
        'profile-a',
        ['native', 'shared', 'new'],
        new Date('2026-09-01T10:00:00.000Z'),
      ),
    ).resolves.toEqual({
      native: '2026-08-30T20:00:00.000Z',
      new: '2026-09-01T10:00:00.000Z',
      shared: '2026-08-31T21:00:00.000Z',
    });
    expect(await AsyncStorage.getItem(legacySchoolLastSeenKey)).toBeNull();
    await expect(
      loadAndSeedSchoolSeen('profile-b', ['native'], new Date('2026-09-02T10:00:00.000Z')),
    ).resolves.toEqual({ native: '2026-09-02T10:00:00.000Z' });
  });

  it('preserves newer Expo group reads and consumes Swift state once', async () => {
    await AsyncStorage.multiSet([
      [
        'dispo.groups.lastSeen.v1:profile-a',
        JSON.stringify({ shared: '2026-08-31T20:00:00.000Z' }),
      ],
      [
        legacyGroupLastSeenKey,
        JSON.stringify({ native: '2026-08-30T19:00:00.000Z', shared: '2026-08-29T18:00:00.000Z' }),
      ],
    ]);

    await expect(
      loadAndSeedGroupSeen(
        'profile-a',
        ['native', 'shared', 'new'],
        new Date('2026-09-01T10:00:00.000Z'),
      ),
    ).resolves.toEqual({
      native: '2026-08-30T19:00:00.000Z',
      new: '2026-09-01T10:00:00.000Z',
      shared: '2026-08-31T20:00:00.000Z',
    });
    expect(await AsyncStorage.getItem(legacyGroupLastSeenKey)).toBeNull();
    await expect(
      loadAndSeedGroupSeen('profile-b', ['native'], new Date('2026-09-02T10:00:00.000Z')),
    ).resolves.toEqual({ native: '2026-09-02T10:00:00.000Z' });
  });

  it('imports Android group reads for the matching profile without seeding them to now', async () => {
    await AsyncStorage.setItem(
      legacyAndroidGroupLastSeenByProfileKey,
      JSON.stringify({
        'profile-a': { native: '2026-08-30T19:00:00.000Z' },
        'profile-b': { native: '2026-08-29T18:00:00.000Z' },
      }),
    );

    await expect(
      loadAndSeedGroupSeen('profile-a', ['native', 'new'], new Date('2026-09-01T10:00:00.000Z')),
    ).resolves.toEqual({
      native: '2026-08-30T19:00:00.000Z',
      new: '2026-09-01T10:00:00.000Z',
    });
    expect(
      JSON.parse((await AsyncStorage.getItem(legacyAndroidGroupLastSeenByProfileKey)) ?? ''),
    ).toEqual({ 'profile-b': { native: '2026-08-29T18:00:00.000Z' } });
    await expect(
      loadAndSeedGroupSeen('profile-b', ['native'], new Date('2026-09-02T10:00:00.000Z')),
    ).resolves.toEqual({ native: '2026-08-29T18:00:00.000Z' });
    expect(await AsyncStorage.getItem(legacyAndroidGroupLastSeenByProfileKey)).toBeNull();
  });
});
