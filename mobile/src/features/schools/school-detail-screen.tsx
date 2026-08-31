import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  AffiliationStatusCard,
  SchoolAvatar,
  SchoolMemberCard,
  VerifiedSchoolSeal,
} from './school-components';
import { schoolDisplayName, schoolErrorMessage } from './school-model';
import {
  useLeaveSchool,
  useMySchoolAffiliations,
  useSchool,
  useSchoolMembers,
} from './school-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function SchoolDetailScreen({ schoolId }: { schoolId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const schoolQuery = useSchool(schoolId);
  const mine = useMySchoolAffiliations();
  const affiliation = mine.data?.find((item) => item.school.id === schoolId) ?? null;
  const members = useSchoolMembers(schoolId, Boolean(affiliation));
  const visibleMembers = members.data?.pages.flatMap((page) => page.items) ?? [];
  const leave = useLeaveSchool();

  if (schoolQuery.isLoading || mine.isLoading) {
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement de l’école…')} />
      </Screen>
    );
  }
  const loadError = schoolQuery.error ?? mine.error;
  if (loadError) {
    return (
      <Screen nativeHeader>
        <ErrorState
          message={loadError.message}
          onRetry={() => void Promise.all([schoolQuery.refetch(), mine.refetch()])}
        />
      </Screen>
    );
  }
  const school = schoolQuery.data;
  if (!school) {
    return (
      <Screen nativeHeader>
        <ErrorState message={t('École introuvable.')} />
      </Screen>
    );
  }

  const confirmLeave = () => {
    Alert.alert(
      t('Quitter cette école ?'),
      t('Ton affiliation disparaîtra et tu ne figureras plus parmi les membres visibles.'),
      [
        { style: 'cancel', text: t('Annuler') },
        {
          onPress: () => {
            void leave
              .mutateAsync(school.id)
              .then(() => router.replace('/schools' as never))
              .catch((error: unknown) =>
                Alert.alert(t('Impossible de quitter l’école'), t(schoolErrorMessage(error))),
              );
          },
          style: 'destructive',
          text: t('Quitter l’école'),
        },
      ],
    );
  };

  return (
    <Screen nativeHeader>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <SchoolAvatar school={school} size={72} />
          <View style={styles.heroCopy}>
            <View style={styles.titleRow}>
              <AppText style={styles.title} variant="title2">
                {school.name}
              </AppText>
              {school.isVerified ? <VerifiedSchoolSeal compact /> : null}
            </View>
            <AppText color={palette.muted}>
              {school.city} · {school.countryCode.toLocaleUpperCase()}
            </AppText>
            {school.isVerified ? <VerifiedSchoolSeal /> : null}
          </View>
        </Card>

        <Card style={styles.proofCard}>
          <View
            style={[
              styles.proofIcon,
              { backgroundColor: school.isVerified ? `${palette.jam}18` : `${palette.bronze}18` },
            ]}
          >
            <Ionicons
              color={school.isVerified ? palette.jam : palette.bronze}
              name={school.isVerified ? 'shield-checkmark' : 'information-circle'}
              size={22}
            />
          </View>
          <View style={styles.proofCopy}>
            <AppText style={styles.proofTitle} variant="subheadline">
              {school.isVerified
                ? t('Identité institutionnelle vérifiée')
                : t('École non vérifiée')}
            </AppText>
            <AppText color={palette.muted} variant="caption">
              {school.isVerified
                ? t('Dispo a confirmé que l’établissement contrôle cette page.')
                : t(
                    'Cette école figure dans l’annuaire, mais elle n’a pas encore pris le contrôle de sa page.',
                  )}
            </AppText>
          </View>
        </Card>

        {school.websiteUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(school.websiteUrl ?? '')}
            style={({ pressed }) => [
              styles.website,
              { backgroundColor: palette.card, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={palette.bronze} name="globe-outline" size={18} />
            <AppText numberOfLines={1} style={styles.websiteText}>
              {formatSwiftPlaceholders(t('Site de %@'), schoolDisplayName(school))}
            </AppText>
            <Ionicons color={palette.muted} name="open-outline" size={15} />
          </Pressable>
        ) : null}

        {affiliation ? (
          <>
            <AffiliationStatusCard affiliation={{ ...affiliation, school }} />
            <DispoButton
              icon="create-outline"
              onPress={() => router.push(`/schools/${school.id}/join` as never)}
              variant="secondary"
            >
              {t('Modifier mon affiliation')}
            </DispoButton>

            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons color={palette.bronze} name="people" size={17} />
                <AppText style={styles.sectionTitle} variant="subheadline">
                  {t('Membres')}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/schools/${school.id}/members` as never)}
              >
                <AppText color={palette.bronze} style={styles.seeAll} variant="caption">
                  {formatSwiftPlaceholders(t('Voir les %lld'), affiliation.memberCount)}
                </AppText>
              </Pressable>
            </View>
            {members.isLoading ? <LoadingState label={t('Chargement des membres…')} /> : null}
            {members.isError ? (
              <Card style={styles.inlineError}>
                <Ionicons color={palette.signal} name="cloud-offline-outline" size={20} />
                <View style={styles.inlineErrorCopy}>
                  <AppText style={styles.inlineErrorTitle} variant="caption">
                    {t('Membres indisponibles')}
                  </AppText>
                  <AppText color={palette.muted} variant="caption2">
                    {t('Cette liste est réservée aux affiliations actives.')}
                  </AppText>
                </View>
                <Pressable onPress={() => void members.refetch()}>
                  <AppText color={palette.bronze} variant="caption">
                    {t('Réessayer')}
                  </AppText>
                </Pressable>
              </Card>
            ) : null}
            {visibleMembers.slice(0, 3).map((member) => (
              <SchoolMemberCard
                key={member.profileId}
                member={member}
                onPress={() => router.push(`/profiles/${member.profileId}` as never)}
              />
            ))}
            <DispoButton disabled={leave.isPending} onPress={confirmLeave} variant="danger">
              {leave.isPending ? t('Départ…') : t('Quitter cette école')}
            </DispoButton>
          </>
        ) : (
          <>
            <Card style={styles.joinCopy}>
              <AppText style={styles.joinTitle} variant="subheadline">
                {t('Ajouter mon école de musique')}
              </AppText>
              <AppText color={palette.muted} variant="caption">
                {t(
                  'Choisis ton rôle et qui peut voir cette affiliation. Ton rôle restera déclaré tant que l’établissement ne l’aura pas validé.',
                )}
              </AppText>
            </Card>
            <DispoButton
              icon="add-circle-outline"
              onPress={() => router.push(`/schools/${school.id}/join` as never)}
            >
              {t('Ajouter mon école')}
            </DispoButton>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.cluster, padding: spacing.gutter, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  heroCopy: { flex: 1, gap: spacing.tight },
  inlineError: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  inlineErrorCopy: { flex: 1, gap: 2 },
  inlineErrorTitle: { fontWeight: '800' },
  joinCopy: { gap: spacing.xs },
  joinTitle: { fontWeight: '800' },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  proofCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  proofCopy: { flex: 1, gap: 4 },
  proofIcon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  proofTitle: { fontWeight: '800' },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: { fontWeight: '800' },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  seeAll: { fontWeight: '800' },
  title: { flexShrink: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  website: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.cluster,
  },
  websiteText: { flex: 1, fontWeight: '700' },
});
