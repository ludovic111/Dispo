import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadOnboardingReplayPlace,
  resetOnboardingReplayPlace,
  saveOnboardingReplayPlace,
} from '@/features/onboarding/onboarding-replay-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("relecture de l'onboarding depuis les réglages", () => {
  it("n'ajoute aucun choix de région par défaut", async () => {
    await expect(loadOnboardingReplayPlace()).resolves.toEqual({
      city: '',
      country: 'CH',
      postalCode: '',
    });
  });

  it('conserve localement une région normalisée entre deux relectures', async () => {
    await saveOnboardingReplayPlace({
      city: '  Genève ',
      country: ' ch ',
      postalCode: ' 1201a ',
    });

    await expect(loadOnboardingReplayPlace()).resolves.toEqual({
      city: 'Genève',
      country: 'CH',
      postalCode: '1201A',
    });
  });

  it('peut être réinitialisé sans toucher à la session ni au profil', async () => {
    await saveOnboardingReplayPlace({ city: 'Lausanne', country: 'CH', postalCode: '1003' });
    await resetOnboardingReplayPlace();

    await expect(loadOnboardingReplayPlace()).resolves.toEqual({
      city: '',
      country: 'CH',
      postalCode: '',
    });
  });
});
