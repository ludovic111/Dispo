import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileDetail } from '@/features/profiles/profile-detail';
import { useProfile } from '@/features/profiles/profile-queries';
import { spacing } from '@/theme/tokens';

export default function MyProfileScreen() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const userId = session?.user.id ?? '';
  const query = useProfile(userId, userId);
  const settings = (
    <HeaderAction
      icon="settings-outline"
      label={t('Réglages')}
      onPress={() => router.push('/settings' as never)}
    />
  );
  if (query.isLoading)
    return (
      <Screen nativeTabRoot>
        <ScreenHeader action={settings} eyebrow={t('Compte')} title={t('Profil')} />
        <LoadingState />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen nativeTabRoot>
        <ScreenHeader action={settings} eyebrow={t('Compte')} title={t('Profil')} />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  return (
    <Screen nativeTabRoot>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader action={settings} eyebrow={t('Compte')} inset={false} title={t('Profil')} />
        {query.data ? <ProfileDetail profile={query.data} self /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
});
