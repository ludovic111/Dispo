import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { profileHandle } from '@/domain/profile';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileDetail } from '@/features/profiles/profile-detail';
import { useProfile } from '@/features/profiles/profile-queries';
import { spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const query = useProfile(id, session?.user.id ?? '');
  if (query.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement du profil…')} />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen nativeHeader>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  return (
    <Screen nativeHeader>
      <Stack.Screen
        options={{ title: query.data ? profileHandle(query.data.name) : t('Profil') }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {query.data ? <ProfileDetail profile={query.data} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { padding: spacing.md, paddingBottom: spacing.xxl } });
