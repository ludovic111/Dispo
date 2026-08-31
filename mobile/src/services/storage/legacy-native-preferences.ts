import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LegacyNativePreferences } from '../../../modules/dispo-legacy-preferences/src/DispoLegacyPreferences.types';
import DispoLegacyPreferencesModule from '../../../modules/dispo-legacy-preferences/src/DispoLegacyPreferencesModule';

import { pushPreferencesKey, notificationsEnabledKey } from '@/features/settings/settings-storage';
import { languageStorageKey, supportedLocales } from '@/i18n';
import { themeStorageKey, type ThemePreference } from '@/theme/theme-context';

export const legacyPreferenceMigrationKey = '@dispo/native-preferences/v3';
export const legacySosShowAllKey = '@dispo/sos/show-all/v1/legacy';
export const legacyOpenedGigIdsKey = '@dispo/gigs/opened/v1/legacy';
export const legacyGroupLastSeenKey = '@dispo/groups/last-seen/v1/legacy';
export const legacyAndroidGroupLastSeenByProfileKey =
  '@dispo/groups/last-seen/android-by-profile/v1/legacy';
export const legacySchoolLastSeenKey = '@dispo/schools/last-seen/v1/legacy';

function isTheme(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function normalizedLegacyPreferences(value: LegacyNativePreferences) {
  const groupLastSeen = Object.fromEntries(
    Object.entries(value.groupLastSeen ?? {}).filter(
      ([groupId, timestamp]) =>
        Boolean(groupId.trim()) &&
        typeof timestamp === 'string' &&
        !Number.isNaN(Date.parse(timestamp)),
    ),
  );
  const openedGigIds = [
    ...new Set(
      (value.openedGigIds ?? []).filter(
        (gigId): gigId is string => typeof gigId === 'string' && Boolean(gigId.trim()),
      ),
    ),
  ].sort();
  const groupLastSeenByProfile = Object.fromEntries(
    Object.entries(value.groupLastSeenByProfile ?? {}).flatMap(([profileId, timestamps]) => {
      if (!profileId.trim() || !timestamps || typeof timestamps !== 'object') return [];
      const valid = Object.fromEntries(
        Object.entries(timestamps).filter(
          ([groupId, timestamp]) =>
            Boolean(groupId.trim()) &&
            typeof timestamp === 'string' &&
            !Number.isNaN(Date.parse(timestamp)),
        ),
      );
      return Object.keys(valid).length > 0 ? [[profileId, valid]] : [];
    }),
  );
  const schoolLastSeen = Object.fromEntries(
    Object.entries(value.schoolLastSeen ?? {}).filter(
      ([schoolId, timestamp]) =>
        Boolean(schoolId.trim()) &&
        typeof timestamp === 'string' &&
        !Number.isNaN(Date.parse(timestamp)),
    ),
  );

  return {
    groupLastSeen,
    groupLastSeenByProfile,
    language: supportedLocales.includes(value.language as (typeof supportedLocales)[number])
      ? value.language
      : null,
    notificationsEnabled:
      typeof value.notificationsEnabled === 'boolean' ? value.notificationsEnabled : null,
    openedGigIds,
    pushPreferences: {
      groups: value.pushGroups !== false,
      messages: value.pushMessages !== false,
      sos: value.pushSos !== false,
    },
    schoolLastSeen,
    sosShowAll: typeof value.sosShowAll === 'boolean' ? value.sosShowAll : null,
    theme: isTheme(value.theme) ? value.theme : null,
  };
}

/**
 * Copie uniquement les choix absents du stockage Expo. Les anciennes valeurs
 * restent intactes pour permettre un retour sûr au client natif de référence.
 */
export async function migrateLegacyNativePreferences(): Promise<void> {
  if (await AsyncStorage.getItem(legacyPreferenceMigrationKey)) return;
  const native = DispoLegacyPreferencesModule?.readAsync();
  // Expo Go/web cannot load the native bridge. Do not mark the migration as
  // consumed there: the same install must still import the values when it is
  // next opened with the signed development/App Store client.
  if (!native) return;
  const value = normalizedLegacyPreferences(native);
  const keys = [
    languageStorageKey,
    notificationsEnabledKey,
    pushPreferencesKey,
    themeStorageKey,
    legacySosShowAllKey,
    legacyOpenedGigIdsKey,
    legacyGroupLastSeenKey,
    legacyAndroidGroupLastSeenByProfileKey,
    legacySchoolLastSeenKey,
  ] as const;
  const existing = new Map(await AsyncStorage.multiGet(keys));
  const additions: [string, string][] = [];
  if (value.language && existing.get(languageStorageKey) === null) {
    additions.push([languageStorageKey, value.language]);
  }
  if (value.notificationsEnabled !== null && existing.get(notificationsEnabledKey) === null) {
    additions.push([notificationsEnabledKey, value.notificationsEnabled ? 'true' : 'false']);
  }
  if (existing.get(pushPreferencesKey) === null) {
    additions.push([pushPreferencesKey, JSON.stringify(value.pushPreferences)]);
  }
  if (value.theme && existing.get(themeStorageKey) === null) {
    additions.push([themeStorageKey, value.theme]);
  }
  if (value.sosShowAll !== null && existing.get(legacySosShowAllKey) === null) {
    additions.push([legacySosShowAllKey, value.sosShowAll ? 'true' : 'false']);
  }
  if (value.openedGigIds.length > 0 && existing.get(legacyOpenedGigIdsKey) === null) {
    additions.push([legacyOpenedGigIdsKey, JSON.stringify(value.openedGigIds)]);
  }
  if (
    Object.keys(value.groupLastSeen).length > 0 &&
    existing.get(legacyGroupLastSeenKey) === null
  ) {
    additions.push([legacyGroupLastSeenKey, JSON.stringify(value.groupLastSeen)]);
  }
  if (
    Object.keys(value.groupLastSeenByProfile).length > 0 &&
    existing.get(legacyAndroidGroupLastSeenByProfileKey) === null
  ) {
    additions.push([
      legacyAndroidGroupLastSeenByProfileKey,
      JSON.stringify(value.groupLastSeenByProfile),
    ]);
  }
  if (
    Object.keys(value.schoolLastSeen).length > 0 &&
    existing.get(legacySchoolLastSeenKey) === null
  ) {
    additions.push([legacySchoolLastSeenKey, JSON.stringify(value.schoolLastSeen)]);
  }
  additions.push([legacyPreferenceMigrationKey, 'complete']);
  await AsyncStorage.multiSet(additions);
}
