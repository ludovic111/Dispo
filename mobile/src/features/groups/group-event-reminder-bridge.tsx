import { useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';

import {
  enqueueGroupEventReminderReconciliation,
  pruneGroupEventRemindersForAccount,
} from './group-event-reminders';
import { useGroupRealtimeSync, useGroups } from './group-queries';

import { useAuth } from '@/features/auth/auth-context';
import { subscribeToNotificationSettings } from '@/features/settings/settings-storage';

export function GroupEventReminderBridge() {
  const { isLoading, session } = useAuth();
  const groups = useGroups();
  const userId = session?.user.id ?? null;
  const previousUserId = useRef<string | null | undefined>(undefined);
  const [settingsRevision, bumpSettingsRevision] = useReducer((value) => value + 1, 0);
  const [foregroundRevision, bumpForegroundRevision] = useReducer((value) => value + 1, 0);

  useGroupRealtimeSync(groups.data);

  useEffect(() => subscribeToNotificationSettings(bumpSettingsRevision), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') bumpForegroundRevision();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isLoading || previousUserId.current === userId) return;
    previousUserId.current = userId;
    void pruneGroupEventRemindersForAccount(userId).catch(() => undefined);
  }, [isLoading, userId]);

  useEffect(() => {
    // Tant que le snapshot du compte n'est pas chargé (par exemple hors
    // ligne), on préserve les rappels déjà présents au lieu de les effacer.
    if (isLoading || !userId || groups.data === undefined) return;
    void enqueueGroupEventReminderReconciliation({ groups: groups.data, userId }).catch(
      () => undefined,
    );
  }, [foregroundRevision, groups.data, groups.dataUpdatedAt, isLoading, settingsRevision, userId]);

  return null;
}
