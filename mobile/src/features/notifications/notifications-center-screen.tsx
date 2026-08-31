import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
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
import { Card } from '@/components/ui/card';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={spacing.sm}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: `${color}1F` }]}>
            <Ionicons color={color} name={icon} size={17} />
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <AppText
                numberOfLines={1}
                style={[styles.title, item.readAt ? undefined : styles.unreadTitle]}
                variant="subheadline"
              >
                {localizedNotificationText(item.title, t)}
              </AppText>
              {!item.readAt ? <View style={[styles.unread, { backgroundColor: color }]} /> : null}
            </View>
            <AppText color={palette.muted} numberOfLines={3} variant="caption">
              {localizedNotificationText(item.body, t)}
            </AppText>
            <AppText color={palette.muted} variant="caption2">
              {relativeNotificationDate(item.createdAt, i18n.resolvedLanguage ?? i18n.language)}
            </AppText>
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={14} />
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
  copy: { flex: 1, gap: spacing.xxxs },
  icon: {
    alignItems: 'center',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.section },
  separator: { height: spacing.control },
  title: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  unread: { borderRadius: 4, height: 7, width: 7 },
  unreadTitle: { fontWeight: '800' },
});
