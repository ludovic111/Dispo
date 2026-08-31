import AsyncStorage from '@react-native-async-storage/async-storage';

import { whatsNewDecision } from './settings-model';

const lastSeenVersionKey = 'dispo.whats-new.last-seen-version';

export async function shouldPresentWhatsNew(currentVersion: string): Promise<boolean> {
  const previousVersion = await AsyncStorage.getItem(lastSeenVersionKey);
  const decision = whatsNewDecision(previousVersion, currentVersion);
  if (decision === 'first-install') {
    await AsyncStorage.setItem(lastSeenVersionKey, currentVersion);
    return false;
  }
  return decision === 'updated';
}

export async function markWhatsNewSeen(currentVersion: string): Promise<void> {
  await AsyncStorage.setItem(lastSeenVersionKey, currentVersion);
}
