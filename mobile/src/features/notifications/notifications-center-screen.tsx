import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  localizedNotificationText,
  notificationDestination,
  notificationItems,
  relativeNotificationDate,
  type AppNotification,
} from './notification-model';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationUnreadCount,
  useNotifications,
} from './notification-queries';

import { AppText } from '@/components/ui/app-text';
import { UnreadDot } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, pressedStyle, radii, spacing, tint } from '@/theme/tokens';

function NotificationCard({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const color =
    item.category === 'sos'
      ? palette.signal
      : item.category === 'messages'
        ? palette.bronze
        : palette.electric;
  const icon =
    item.category === 'sos'
      ? 'flash'
      : item.category === 'messages'
        ? 'chatbubbles'
        : item.category === 'groups'
          ? 'people'
          : 'notifications';
  const unread = !item.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <Card padding={spacing.sm}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: tint(color, 0.12) }]}>
            <Ionicons color={color} name={icon} size={20} />
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <AppText
                numberOfLines={2}
                style={styles.title}
                variant="subheadline"
                weight={unread ? 'bold' : 'semibold'}
              >
                {localizedNotificationText(item.title, t)}
              </AppText>
              {unread ? <UnreadDot color={color} /> : null}
            </View>
            <AppText color={palette.muted} numberOfLines={3} variant="caption">
              {localizedNotificationText(item.body, t)}
            </AppText>
            <AppText color={palette.muted} variant="caption2">
              {relativeNotificationDate(item.createdAt, i18n.resolvedLanguage ?? i18n.language)}
            </AppText>
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={18} />
        </View>
      </Card>
    </Pressable>
  );
}

export function NotificationsCenterScreen() {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const query = useNotifications();
  const unreadQuery = useNotificationUnreadCount();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const { refetch: refetchNotifications } = query;
  const { refetch: refetchUnread } = unreadQuery;
  // Refresh on every visit, including when cached data is fresh or realtime
  // missed an arrival while the app was in the background.
  useFocusEffect(
    useCallback(() => {
      void Promise.all([refetchNotifications(), refetchUnread()]);
    }, [refetchNotifications, refetchUnread]),
  );
  const notifications = notificationItems(query.data);
  const unread = unreadQuery.data ?? notifications.filter((item) => !item.readAt).length;
  const nativeHeader = (
    <Stack.Screen
      options={{
        headerLeft: () => <NativeHeaderButton label={t('Fermer')} onPress={() => router.back()} />,
        headerRight: () =>
          unread > 0 ? (
            <NativeHeaderButton
              disabled={markAll.isPending}
              label={t('Tout lire')}
              onPress={() => markAll.mutate()}
            />
          ) : null,
        title: t('Notifications'),
      }}
    />
  );

  if (query.isLoading) {
    return (
      <Screen nativeHeader>
        {nativeHeader}
        <LoadingState label={t('Chargement des notifications…')} />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen nativeHeader>
        {nativeHeader}
        <ErrorState message={t('Chargement impossible.')} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen nativeHeader>
      {nativeHeader}
      <FlashList
        contentContainerStyle={styles.content}
        data={notifications}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-off-outline"
            message={t('Les SOS, messages et événements de groupe apparaîtront ici.')}
            title={t('Aucune notification')}
          />
        }
        refreshControl={
          <RefreshControl
            colors={[palette.electric]}
            onRefresh={() => void Promise.all([query.refetch(), unreadQuery.refetch()])}
            refreshing={query.isRefetching || unreadQuery.isRefetching}
            tintColor={palette.electric}
          />
        }
        ListFooterComponent={
          query.isFetchingNextPage ? <LoadingState label={t('Chargement de la suite…')} /> : null
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.45}
        renderItem={({ item }) => (
          <NotificationCard
            item={item}
            onPress={() => {
              if (!item.readAt) markOne.mutate(item.id);
              router.dismiss();
              router.push(notificationDestination(item) as never);
            }}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  copy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  icon: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  separator: { height: spacing.sm },
  title: { flexShrink: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
});
