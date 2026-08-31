import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { LocationPrecision, PushPreferences } from './settings-model';

import i18n from '@/i18n';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type SettingsProfile = Pick<
  ProfileRow,
  'city' | 'country' | 'location_precision' | 'name' | 'photo_url' | 'postal_code'
>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function fetchSettingsProfile(userId: string): Promise<SettingsProfile> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('name,photo_url,country,postal_code,city,location_precision')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

function roundedCoordinate(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

async function currentCoordinate(): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('location_permission_denied');
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return location.coords;
}

export async function updateLocationPrecision(
  userId: string,
  precision: LocationPrecision,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (precision === 'hidden') {
    const profileResult = await supabase
      .from('profiles')
      .update({ latitude: null, location_precision: 'hidden', longitude: null })
      .eq('id', userId);
    if (profileResult.error) throw profileResult.error;
    const exactResult = await supabase.from('profile_locations').delete().eq('user_id', userId);
    if (exactResult.error) throw exactResult.error;
    return;
  }

  const coordinate = await currentCoordinate();
  const cityCoordinate = {
    latitude: roundedCoordinate(coordinate.latitude, 2),
    longitude: roundedCoordinate(coordinate.longitude, 2),
  };
  if (precision === 'city') {
    const cityResult = await supabase
      .from('profiles')
      .update({ ...cityCoordinate, location_precision: precision })
      .eq('id', userId);
    if (cityResult.error) throw cityResult.error;
    const exactResult = await supabase.from('profile_locations').delete().eq('user_id', userId);
    if (exactResult.error) throw exactResult.error;
    return;
  }

  const exactResult = await supabase.from('profile_locations').upsert({
    latitude: roundedCoordinate(coordinate.latitude, 3),
    longitude: roundedCoordinate(coordinate.longitude, 3),
    user_id: userId,
  });
  if (exactResult.error) throw exactResult.error;
  const profileResult = await supabase
    .from('profiles')
    .update({ ...cityCoordinate, location_precision: precision })
    .eq('id', userId);
  if (profileResult.error) throw profileResult.error;
}

export async function deleteCurrentAccount(): Promise<void> {
  const supabase = getSupabaseClient();
  const userResult = await supabase.auth.getUser();
  if (userResult.error) throw userResult.error;
  const userId = userResult.data.user?.id;
  if (!userId) throw new Error('account_deletion_unauthenticated');

  const prepared = await supabase.rpc('prepare_my_message_file_cleanup');
  if (prepared.error) throw prepared.error;
  const cleanup = await supabase.from('message_file_cleanup').select('path');
  if (cleanup.error) throw cleanup.error;
  for (const row of cleanup.data) {
    const removed = await supabase.storage.from('message-files').remove([row.path]);
    if (removed.error) throw removed.error;
    const completed = await supabase.rpc('complete_message_file_cleanup', { p_path: row.path });
    if (completed.error) throw completed.error;
  }

  const removePrefix = async (bucket: 'avatars' | 'demo-videos') => {
    const paths: string[] = [];
    let offset = 0;
    while (true) {
      const listed = await supabase.storage.from(bucket).list(userId.toLowerCase(), {
        limit: 100,
        offset,
      });
      if (listed.error) throw listed.error;
      const files = listed.data.filter((file) => file.id !== null);
      paths.push(...files.map((file) => `${userId.toLowerCase()}/${file.name}`));
      if (listed.data.length < 100) break;
      offset += listed.data.length;
    }
    if (paths.length > 0) {
      const removed = await supabase.storage.from(bucket).remove(paths);
      if (removed.error) throw removed.error;
    }
  };

  await Promise.all([removePrefix('avatars'), removePrefix('demo-videos')]);

  const [uploadedDocuments, ledGroups] = await Promise.all([
    supabase.from('group_docs').select('id,path').eq('added_by', userId),
    supabase.from('music_groups').select('id').eq('leader_id', userId),
  ]);
  if (uploadedDocuments.error) throw uploadedDocuments.error;
  if (ledGroups.error) throw ledGroups.error;
  let ledDocuments: { id: string; path: string }[] = [];
  if (ledGroups.data.length > 0) {
    const result = await supabase
      .from('group_docs')
      .select('id,path')
      .in(
        'group_id',
        ledGroups.data.map((group) => group.id),
      );
    if (result.error) throw result.error;
    ledDocuments = result.data;
  }
  const documents = [
    ...new Map(
      [...uploadedDocuments.data, ...ledDocuments].map((document) => [document.id, document]),
    ).values(),
  ];
  if (documents.length > 0) {
    const removed = await supabase.storage
      .from('group-docs')
      .remove(documents.map((document) => document.path));
    if (removed.error) throw removed.error;
    const deleted = await supabase
      .from('group_docs')
      .delete()
      .in(
        'id',
        documents.map((document) => document.id),
      );
    if (deleted.error) throw deleted.error;
  }

  const remaining = await supabase.from('message_file_cleanup').select('path').limit(1);
  if (remaining.error) throw remaining.error;
  if (remaining.data.length > 0) throw new Error('account_deletion_pending_files');
  const deleted = await supabase.rpc('delete_my_account');
  if (deleted.error) throw deleted.error;
}

export type NotificationPermission =
  'denied' | 'ephemeral' | 'granted' | 'provisional' | 'undetermined';

function notificationPermission(
  permission: Notifications.NotificationPermissionsStatus,
): NotificationPermission {
  if (Platform.OS === 'ios' && permission.ios) {
    if (permission.ios.status === Notifications.IosAuthorizationStatus.AUTHORIZED) return 'granted';
    if (permission.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL)
      return 'provisional';
    if (permission.ios.status === Notifications.IosAuthorizationStatus.EPHEMERAL)
      return 'ephemeral';
    if (permission.ios.status === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
    return 'undetermined';
  }
  if (permission.status === 'granted') return 'granted';
  if (permission.status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return notificationPermission(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      importance: Notifications.AndroidImportance.HIGH,
      name: 'Dispo',
      vibrationPattern: [0, 180, 120, 180],
    });
  }
  return notificationPermission(await Notifications.requestPermissionsAsync());
}

export async function disableLocalNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.setBadgeCountAsync(0);
}

export async function registerPushDevice(
  userId: string,
  preferences: PushPreferences,
  locale: string,
): Promise<string> {
  const nativeToken = await Notifications.getDevicePushTokenAsync();
  const token = String(nativeToken.data);
  const { error } = await getSupabaseClient()
    .from('push_devices')
    .upsert(
      {
        app_version: Constants.expoConfig?.version ?? '2.4.0',
        environment: __DEV__ ? 'development' : 'production',
        groups_enabled: preferences.groups,
        last_seen_at: new Date().toISOString(),
        locale,
        messages_enabled: preferences.messages,
        notifications_enabled: true,
        platform: Platform.OS,
        sos_enabled: preferences.sos,
        token,
        user_id: userId,
      },
      { onConflict: 'token' },
    );
  if (error) throw error;
  return token;
}

export async function unregisterPushDevice(token: string): Promise<void> {
  const { error } = await getSupabaseClient().from('push_devices').delete().eq('token', token);
  if (error) throw error;
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      body: i18n.t('Test réussi — les notifications fonctionnent !'),
      sound: 'default',
      title: i18n.t('🚨 Nouveau SOS pour toi'),
    },
    trigger: null,
  });
}
