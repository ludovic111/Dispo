import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileAvailabilityOverview, ProfileDetail } from '@/features/profiles/profile-detail';
import { useProfile } from '@/features/profiles/profile-queries';
import { RepertoireScreen } from '@/features/repertoire/repertoire-screen';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, spacing } from '@/theme/tokens';

const profileTabs = [
  { id: 'profile', label: 'Profil' },
  { id: 'repertoire', label: 'Répertoire' },
  { id: 'availability', label: 'Dispos' },
] as const;

export default function MyProfileScreen() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const [tab, setTab] = useState<(typeof profileTabs)[number]['id']>('profile');
  const userId = session?.user.id ?? '';
  const query = useProfile(userId, userId);
  return (
    <Screen nativeTabRoot>
      <ScreenHeader
        action={
          <View style={styles.headerActions}>
            <HeaderAction
              icon="share-outline"
              label={t('Partager')}
              disabled={!query.data}
              onPress={() => {
                if (!query.data) return;
                void Share.share({
                  message: `${query.data.name} · Dispo\ndispo://profiles/${userId}`,
                }).catch(() => Alert.alert(t('Erreur'), t('Impossible de partager le profil.')));
              }}
            />
            <HeaderAction
              icon="settings-outline"
              label={t('Réglages')}
              onPress={() => router.push('/settings' as never)}
            />
          </View>
        }
        eyebrow={t('Compte')}
        title={t('Profil')}
      />
      <View style={[styles.tabs, { borderBottomColor: palette.border }]}>
        {profileTabs.map(({ id, label }) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={[
              styles.tab,
              {
                borderBottomColor: tab === id ? palette.electric : 'transparent',
              },
            ]}
          >
            <AppText style={styles.tabLabel} color={tab === id ? palette.electric : palette.muted}>
              {t(label)}
            </AppText>
          </Pressable>
        ))}
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
  content: { padding: spacing.lg, paddingBottom: 108 },
  headerActions: { flexDirection: 'row', gap: 8, alignSelf: 'center' },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    gap: 24,
  },
  tab: {
    flexShrink: 1,
    minHeight: minimumTouchTarget,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: 2,
    justifyContent: 'center',
  },
  tabLabel: { textAlign: 'left', fontSize: 14, fontWeight: '700' },
});
