import { describe, expect, it, jest } from '@jest/globals';

import {
  enableNotificationsDuringOnboarding,
  type OnboardingNotificationDependencies,
} from '@/features/onboarding/onboarding-notifications';

// Les dépendances sont injectées : les modules natifs ne doivent pas s'initialiser sous Jest.
jest.mock('@/features/settings/settings-service', () => ({
  registerPushDevice: jest.fn(),
  requestNotificationPermission: jest.fn(),
  unregisterPushDevice: jest.fn(),
}));
jest.mock('@/features/settings/settings-storage', () => ({
  loadPushPreferences: jest.fn(),
  loadPushToken: jest.fn(),
  saveNotificationsEnabled: jest.fn(),
  savePushToken: jest.fn(),
}));

function dependencies(
  overrides: Partial<OnboardingNotificationDependencies> = {},
): OnboardingNotificationDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    loadPreferences: async () => ({ groups: true, messages: true, sos: true }),
    loadToken: async () => 'old-token',
    register: async () => {
      calls.push('register');
      return 'new-token';
    },
    requestPermission: async () => 'granted' as const,
    saveEnabled: async (enabled: boolean) => {
      calls.push(`enabled:${enabled}`);
    },
    saveToken: async (token: string) => {
      calls.push(`token:${token}`);
    },
    unregister: async (token: string) => {
      calls.push(`unregister:${token}`);
    },
    ...overrides,
  };
}

describe('notifications pendant l’onboarding', () => {
  it('active le réglage, inscrit le téléphone et retire l’ancien jeton', async () => {
    const deps = dependencies();
    await expect(enableNotificationsDuringOnboarding('user', 'fr', deps)).resolves.toBe('granted');
    expect(deps.calls).toEqual([
      'enabled:true',
      'register',
      'token:new-token',
      'unregister:old-token',
    ]);
  });

  it('respecte un refus système sans tenter d’inscription', async () => {
    const deps = dependencies({ requestPermission: async () => 'denied' as const });
    await expect(enableNotificationsDuringOnboarding('user', 'fr', deps)).resolves.toBe('blocked');
    expect(deps.calls).toEqual(['enabled:false']);
  });

  it('ne bloque pas le parcours quand l’inscription distante échoue', async () => {
    const deps = dependencies({
      register: async () => {
        throw new Error('network');
      },
    });
    await expect(enableNotificationsDuringOnboarding('user', 'fr', deps)).resolves.toBe(
      'registration-failed',
    );
    expect(deps.calls).toEqual(['enabled:true']);
  });
});
