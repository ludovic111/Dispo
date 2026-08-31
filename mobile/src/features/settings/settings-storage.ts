import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultPushPreferences, type PushPreferences } from './settings-model';

const notificationsEnabledKey = 'dispo.settings.notifications-enabled';
const pushPreferencesKey = 'dispo.settings.push-preferences';
const pushTokenKey = 'dispo.settings.native-push-token';
const notificationSettingsListeners = new Set<() => void>();

function emitNotificationSettingsChange(): void {
  for (const listener of notificationSettingsListeners) listener();
}

export function subscribeToNotificationSettings(listener: () => void): () => void {
  notificationSettingsListeners.add(listener);
  return () => notificationSettingsListeners.delete(listener);
}

export async function loadNotificationsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(notificationsEnabledKey)) === 'true';
}

export async function saveNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(notificationsEnabledKey, enabled ? 'true' : 'false');
  emitNotificationSettingsChange();
}

export async function loadPushPreferences(): Promise<PushPreferences> {
  const value = await AsyncStorage.getItem(pushPreferencesKey);
  if (!value) return defaultPushPreferences;
  try {
    const parsed = JSON.parse(value) as Partial<PushPreferences>;
    return {
      groups: parsed.groups !== false,
      messages: parsed.messages !== false,
      sos: parsed.sos !== false,
    };
  } catch {
    return defaultPushPreferences;
  }
}

export async function savePushPreferences(preferences: PushPreferences): Promise<void> {
  await AsyncStorage.setItem(pushPreferencesKey, JSON.stringify(preferences));
  emitNotificationSettingsChange();
}

export async function loadPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(pushTokenKey);
}

export async function savePushToken(token: string): Promise<void> {
  await AsyncStorage.setItem(pushTokenKey, token);
}

export async function clearPushToken(): Promise<void> {
  await AsyncStorage.removeItem(pushTokenKey);
}
