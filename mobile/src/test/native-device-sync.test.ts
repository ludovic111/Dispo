import { describe, expect, it, jest } from '@jest/globals';

import {
  pushPreferencesForTests,
  synchronizePushRegistration,
  synchronizeSharedLocation,
  type LocationSyncDependencies,
  type PushSyncDependencies,
} from '@/features/settings/native-device-sync';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function pushDependencies(overrides: Partial<PushSyncDependencies> = {}): PushSyncDependencies {
  return {
    getPermission: jest.fn<PushSyncDependencies['getPermission']>(async () => 'granted'),
    loadEnabled: jest.fn(async () => true),
    loadPreferences: jest.fn(async () => pushPreferencesForTests()),
    loadToken: jest.fn(async () => 'old-token'),
    register: jest.fn(async () => 'new-token'),
    saveToken: jest.fn(async () => undefined),
    unregister: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('synchronisation native au retour au premier plan', () => {
  it('réinscrit le jeton et retire l’ancien après une rotation', async () => {
    const dependencies = pushDependencies();
    await expect(synchronizePushRegistration('user-id', 'fr', dependencies)).resolves.toBe(
      'registered',
    );
    expect(dependencies.register).toHaveBeenCalledWith('user-id', pushPreferencesForTests(), 'fr');
    expect(dependencies.saveToken).toHaveBeenCalledWith('new-token');
    expect(dependencies.unregister).toHaveBeenCalledWith('old-token');
  });

  it('ne demande ni jeton ni écriture si la permission est bloquée', async () => {
    const dependencies = pushDependencies({
      getPermission: jest.fn<PushSyncDependencies['getPermission']>(async () => 'denied'),
    });
    await expect(synchronizePushRegistration('user-id', 'fr', dependencies)).resolves.toBe(
      'permission-blocked',
    );
    expect(dependencies.register).not.toHaveBeenCalled();
    expect(dependencies.saveToken).not.toHaveBeenCalled();
  });

  it('rafraîchit seulement une position déjà partagée', async () => {
    const refresh = jest.fn(async () => undefined);
    const shared: LocationSyncDependencies = {
      fetchProfile: jest.fn(async () => ({
        city: 'Genève',
        country: 'CH',
        location_precision: 'exact_friends',
        name: 'Ludovic',
        photo_url: null,
        postal_code: '1201',
      })),
      refresh,
    };
    await expect(synchronizeSharedLocation('user-id', shared)).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledWith('user-id', 'exact_friends');

    const hidden: LocationSyncDependencies = {
      ...shared,
      fetchProfile: jest.fn(async () => ({
        city: 'Genève',
        country: 'CH',
        location_precision: 'hidden',
        name: 'Ludovic',
        photo_url: null,
        postal_code: '1201',
      })),
    };
    refresh.mockClear();
    await expect(synchronizeSharedLocation('user-id', hidden)).resolves.toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
