import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, View } from 'react-native';

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
import { ListRow } from '@/components/ui/list-row';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

/** Icône et couleur fixes par catégorie : même repère dans toute l'app. */
const categoryIcons: Record<
  AppNotification['category'],
  { icon: ComponentProps<typeof Ionicons>['name']; palette: 'signal' | 'bronze' | 'electric' }
> = {
  groups: { icon: 'people', palette: 'electric' },
  messages: { icon: 'chatbubbles', palette: 'bronze' },
  sos: { icon: 'flash', palette: 'signal' },
  unknown: { icon: 'notifications', palette: 'electric' },
};

function NotificationCard({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const category = categoryIcons[item.category];
  const color = palette[category.palette];
  const unread = !item.readAt;
  const title = localizedNotificationText(item.title, t);
  const body = localizedNotificationText(item.body, t);
  const date = relativeNotificationDate(item.createdAt, i18n.resolvedLanguage ?? i18n.language);
  return (
    <ListRow
      accessibilityLabel={`${unread ? `${t('Non lu')} · ` : ''}${title} · ${body} · ${date}`}
      accessory={
        <View style={styles.trailing}>
          <AppText color={unread ? palette.electric : palette.muted} variant="caption2">
            {date}
          </AppText>
          {unread ? <UnreadDot color={color} /> : null}
        </View>
      }
      leadingIcon={category.icon}
      leadingIconColor={color}
      onPress={onPress}
      subtitle={body}
      title={title}
      titleLines={2}
    />
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
  separator: { height: spacing.sm },
  trailing: { alignItems: 'flex-end', gap: spacing.xs, justifyContent: 'center' },
});
