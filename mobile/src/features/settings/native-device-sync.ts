import type { LocationPrecision, PushPreferences } from './settings-model';
import { permissionAllowsDelivery } from './settings-model';
import {
  fetchSettingsProfile,
  getNotificationPermission,
  refreshSharedLocation,
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

export interface LocationSyncDependencies {
  fetchProfile: typeof fetchSettingsProfile;
  refresh: typeof refreshSharedLocation;
}

const defaultLocationSyncDependencies: LocationSyncDependencies = {
  fetchProfile: fetchSettingsProfile,
  refresh: refreshSharedLocation,
};

function sharedPrecision(value: string): Exclude<LocationPrecision, 'hidden'> | null {
  if (value === 'city' || value === 'exact_friends' || value === 'exact_everyone') return value;
  return null;
}

/** Refreshes an already-authorized location without opening a permission dialog. */
export async function synchronizeSharedLocation(
  userId: string,
  dependencies: LocationSyncDependencies = defaultLocationSyncDependencies,
): Promise<boolean> {
  const profile = await dependencies.fetchProfile(userId);
  const precision = sharedPrecision(profile.location_precision);
  if (!precision) return false;
  await dependencies.refresh(userId, precision);
  return true;
}

export function pushPreferencesForTests(value?: Partial<PushPreferences>): PushPreferences {
  return { groups: true, messages: true, sos: true, ...value };
}
