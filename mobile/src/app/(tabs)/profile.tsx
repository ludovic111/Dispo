import { ScrollView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileDetail } from '@/features/profiles/profile-detail';
import { useProfile } from '@/features/profiles/profile-queries';
import { spacing } from '@/theme/tokens';

export default function MyProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useProfile(userId, userId);
  if (query.isLoading)
    return (
      <Screen>
        <ScreenHeader eyebrow="Compte" icon="settings-outline" title="Profil" />
        <LoadingState />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen>
        <ScreenHeader eyebrow="Compte" icon="settings-outline" title="Profil" />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader eyebrow="Compte" icon="settings-outline" title="Profil" />
        {query.data ? <ProfileDetail profile={query.data} self /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
});
