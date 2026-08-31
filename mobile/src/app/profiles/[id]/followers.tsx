import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { ProfileConnectionRow } from '@/features/profiles/profile-connection-row';
import { useProfileFollowers } from '@/features/profiles/profile-social-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { spacing } from '@/theme/tokens';

export default function FollowersScreen() {
  const { t } = useTranslation();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const query = useProfileFollowers(id);
  const followers = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );
  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label={t('Chargement des abonnés…')} />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: t('Abonnés') }} />
      <FlashList
        contentContainerStyle={styles.content}
        data={followers}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            message={formatSwiftPlaceholders(
              t("%@ n'a pas encore d'abonnés."),
              name || t('Ce musicien'),
            )}
            title={t('Aucun abonné')}
          />
        }
        ListHeaderComponent={
          <AppText style={styles.intro} variant="caption">
            {formatSwiftPlaceholders(
              t('Les abonnés de %@ — un tap ouvre leur profil.'),
              name || t('ce profil'),
            )}
          </AppText>
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.55}
        renderItem={({ item }) => <ProfileConnectionRow profile={item} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  intro: { paddingBottom: spacing.sm, paddingTop: spacing.sm },
  separator: { height: spacing.xs },
});
