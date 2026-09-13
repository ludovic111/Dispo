import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { UnderlineTabs } from '@/components/ui/segmented-control';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileAvailabilityOverview, ProfileDetail } from '@/features/profiles/profile-detail';
import { useProfile } from '@/features/profiles/profile-queries';
import { RepertoireScreen } from '@/features/repertoire/repertoire-screen';
import { spacing } from '@/theme/tokens';

const profileTabs = [
  { id: 'profile', label: 'Profil' },
  { id: 'repertoire', label: 'Répertoire' },
  { id: 'availability', label: 'Dispos' },
] as const;

type ProfileTab = (typeof profileTabs)[number]['id'];

export default function MyProfileScreen() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<ProfileTab>('profile');
  const userId = session?.user.id ?? '';
  const query = useProfile(userId, userId);
  return (
    <Screen nativeTabRoot>
      <ScreenHeader
        action={
          <>
            <IconButton
              accessibilityLabel={t('Partager')}
              disabled={!query.data}
              icon="share-outline"
              onPress={() => {
                if (!query.data) return;
                void Share.share({
                  message: `${query.data.name} · Dispo\ndispo://profiles/${userId}`,
                }).catch(() => Alert.alert(t('Erreur'), t('Impossible de partager le profil.')));
              }}
            />
            <IconButton
              accessibilityLabel={t('Réglages')}
              icon="settings-outline"
              onPress={() => router.push('/settings' as never)}
            />
          </>
        }
        title={t('Profil')}
      />
      <View style={styles.tabs}>
        <UnderlineTabs
          onChange={setTab}
          options={profileTabs.map(({ id, label }) => ({ label: t(label), value: id }))}
          value={tab}
        />
      </View>
      {tab === 'repertoire' ? (
        <RepertoireScreen embedded profileId={userId} />
      ) : query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <ScrollView key={tab} contentContainerStyle={styles.content}>
          {tab === 'profile' ? (
            <ProfileDetail profile={query.data} self />
          ) : (
            <ProfileAvailabilityOverview profile={query.data} />
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: spacing.xxl },
  tabs: { paddingHorizontal: spacing.gutter },
});
