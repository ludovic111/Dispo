import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { ProfileConnectionRow } from '@/features/profiles/profile-connection-row';
import { useProfileCollaborators } from '@/features/profiles/profile-social-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { spacing } from '@/theme/tokens';

export default function PlayedWithScreen() {
  const { t } = useTranslation();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const query = useProfileCollaborators(id);
  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label={t('Chargement des collaborations…')} />
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
      <Stack.Screen options={{ title: t('A joué avec') }} />
      <FlashList
        contentContainerStyle={styles.content}
        data={query.data ?? []}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            icon="musical-notes-outline"
            message={t('Les collaborations déclarées apparaîtront ici.')}
            title={t('Aucune collaboration')}
          />
        }
        ListHeaderComponent={
          <AppText style={styles.intro} variant="caption">
            {formatSwiftPlaceholders(
              t('Les musiciens qui ont joué avec %@ — un tap ouvre leur profil.'),
              name || t('ce profil'),
            )}
          </AppText>
        }
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
