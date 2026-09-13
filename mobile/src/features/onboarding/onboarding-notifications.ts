import { permissionAllowsDelivery } from '@/features/settings/settings-model';
import {
  registerPushDevice,
  requestNotificationPermission,
  unregisterPushDevice,
} from '@/features/settings/settings-service';
import {
  loadPushPreferences,
  loadPushToken,
  saveNotificationsEnabled,
  savePushToken,
} from '@/features/settings/settings-storage';

export type OnboardingNotificationOutcome = 'blocked' | 'granted' | 'registration-failed';

export interface OnboardingNotificationDependencies {
  loadPreferences: typeof loadPushPreferences;
  loadToken: typeof loadPushToken;
  register: typeof registerPushDevice;
  requestPermission: typeof requestNotificationPermission;
  saveEnabled: typeof saveNotificationsEnabled;
  saveToken: typeof savePushToken;
  unregister: typeof unregisterPushDevice;
}

const defaultDependencies: OnboardingNotificationDependencies = {
  loadPreferences: loadPushPreferences,
  loadToken: loadPushToken,
  register: registerPushDevice,
  requestPermission: requestNotificationPermission,
  saveEnabled: saveNotificationsEnabled,
  saveToken: savePushToken,
  unregister: unregisterPushDevice,
};

/**
 * Même chaîne que l'écran Réglages → Notifications : permission système, réglage local,
 * puis inscription du téléphone aux alertes distantes. Un échec d'inscription n'est pas
 * bloquant : les alertes locales restent actives et la synchro reprendra au prochain
 * premier plan.
 */
export async function enableNotificationsDuringOnboarding(
  userId: string,
  locale: string,
  dependencies: OnboardingNotificationDependencies = defaultDependencies,
): Promise<OnboardingNotificationOutcome> {
  const permission = await dependencies.requestPermission();
  const allowed = permissionAllowsDelivery(permission);
  await dependencies.saveEnabled(allowed);
  if (!allowed) return 'blocked';
  try {
    const [preferences, previousToken] = await Promise.all([
      dependencies.loadPreferences(),
      dependencies.loadToken(),
    ]);
    const token = await dependencies.register(userId, preferences, locale);
    await dependencies.saveToken(token);
    if (previousToken && previousToken !== token) {
      await dependencies.unregister(previousToken).catch(() => undefined);
    }
    return 'granted';
  } catch {
    return 'registration-failed';
  }
}
