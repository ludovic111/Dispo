import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { defaultPushPreferences, type PushPreferences } from './settings-model';

export const notificationsEnabledKey = 'dispo.settings.notifications-enabled';
export const pushPreferencesKey = 'dispo.settings.push-preferences';
const pushTokenKey = 'dispo.settings.native-push-token';
/** Synchronisation des sessions à venir dans le calendrier « Dispo » de l'appareil. */
export const calendarSyncKey = 'dispo.settings.calendar-sync';
/** Masque les pochettes d'album dans le répertoire et les setlists. */
export const hideAlbumCoversKey = 'dispo.settings.hide-album-covers';
const notificationSettingsListeners = new Set<() => void>();
const preferenceListeners = new Map<string, Set<() => void>>();

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

function emitPreferenceChange(key: string): void {
  for (const listener of preferenceListeners.get(key) ?? []) listener();
}

/** Écoute les changements d'une préférence booléenne, dans l'écran ou dans un pont. */
export function subscribeToPreference(key: string, listener: () => void): () => void {
  const listeners = preferenceListeners.get(key) ?? new Set<() => void>();
  listeners.add(listener);
  preferenceListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadBooleanPreference(key: string): Promise<boolean> {
  return (await AsyncStorage.getItem(key)) === 'true';
}

export async function saveBooleanPreference(key: string, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(key, enabled ? 'true' : 'false');
  emitPreferenceChange(key);
}

export function loadCalendarSyncEnabled(): Promise<boolean> {
  return loadBooleanPreference(calendarSyncKey);
}

export function saveCalendarSyncEnabled(enabled: boolean): Promise<void> {
  return saveBooleanPreference(calendarSyncKey, enabled);
}

export function loadHideAlbumCovers(): Promise<boolean> {
  return loadBooleanPreference(hideAlbumCoversKey);
}

export function saveHideAlbumCovers(enabled: boolean): Promise<void> {
  return saveBooleanPreference(hideAlbumCoversKey, enabled);
}

/**
 * Préférence booléenne persistée : `[valeur, changer, chargée]`. La valeur suit
 * les écritures faites ailleurs (même clé) grâce aux écouteurs de préférence.
 */
export function useBooleanPreference(
  key: string,
): [boolean, (enabled: boolean) => Promise<void>, boolean] {
  const [value, setValue] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadBooleanPreference(key)
        .then((enabled) => {
          if (!active) return;
          setValue(enabled);
          setLoaded(true);
        })
        .catch(() => {
          if (active) setLoaded(true);
        });
    };
    refresh();
    const unsubscribe = subscribeToPreference(key, refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [key]);

  const update = useCallback(
    async (enabled: boolean) => {
      setValue(enabled);
      await saveBooleanPreference(key, enabled);
    },
    [key],
  );

  return [value, update, loaded];
}
