import type { PushPreferences } from './settings-model';
import { permissionAllowsDelivery } from './settings-model';
import {
  getNotificationPermission,
  registerPushDevice,
  unregisterPushDevice,
} from './settings-service';
import {
  loadNotificationsEnabled,
  loadPushPreferences,
  loadPushToken,
  savePushToken,
} from './settings-storage';

export type PushSyncOutcome = 'disabled' | 'permission-blocked' | 'registered';

export interface PushSyncDependencies {
  getPermission: typeof getNotificationPermission;
  loadEnabled: typeof loadNotificationsEnabled;
  loadPreferences: typeof loadPushPreferences;
  loadToken: typeof loadPushToken;
  register: typeof registerPushDevice;
  saveToken: typeof savePushToken;
  unregister: typeof unregisterPushDevice;
}

const defaultPushSyncDependencies: PushSyncDependencies = {
  getPermission: getNotificationPermission,
  loadEnabled: loadNotificationsEnabled,
  loadPreferences: loadPushPreferences,
  loadToken: loadPushToken,
  register: registerPushDevice,
  saveToken: savePushToken,
  unregister: unregisterPushDevice,
};

/**
 * Refreshes the native APNs/FCM token without ever prompting for permission.
 * This covers token rotation and restores remote notifications after login or
 * a foreground transition even when the settings screen is never reopened.
 */
export async function synchronizePushRegistration(
  userId: string,
  locale: string,
  dependencies: PushSyncDependencies = defaultPushSyncDependencies,
): Promise<PushSyncOutcome> {
  const [enabled, permission, preferences, previousToken] = await Promise.all([
    dependencies.loadEnabled(),
    dependencies.getPermission(),
    dependencies.loadPreferences(),
    dependencies.loadToken(),
  ]);
  if (!enabled) return 'disabled';
  if (!permissionAllowsDelivery(permission)) return 'permission-blocked';

  const token = await dependencies.register(userId, preferences, locale);
  await dependencies.saveToken(token);
  if (previousToken && previousToken !== token) {
    await dependencies.unregister(previousToken).catch(() => undefined);
  }
  return 'registered';
}

export function pushPreferencesForTests(value?: Partial<PushPreferences>): PushPreferences {
  return { groups: true, messages: true, sos: true, ...value };
}
