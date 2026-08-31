import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GigDetailContent } from '@/features/gigs/gig-detail';
import { markGigOpened } from '@/features/gigs/gig-opened-store';
import { useGig } from '@/features/gigs/gig-queries';
import { spacing } from '@/theme/tokens';

export default function GigDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useGig(id);
  const { t } = useTranslation();

  useEffect(() => {
    if (userId && id) void markGigOpened(userId, id).catch(() => undefined);
  }, [id, userId]);

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label={t('Chargement du SOS…')} />
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
  if (!query.data) {
    return (
      <Screen>
        <ErrorState message={t('Annonce introuvable.')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GigDetailContent
          gig={query.data}
          onDeleted={() => router.back()}
          onShowMatches={() => router.push(`/gigs/matches?id=${query.data.id}` as never)}
          userId={userId}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
});
