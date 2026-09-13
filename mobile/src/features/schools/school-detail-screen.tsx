import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

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
import { ListRow } from '@/components/ui/list-row';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, tint } from '@/theme/tokens';

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

  const proofColor = school.isVerified ? palette.jam : palette.bronze;
  return (
    <Screen nativeHeader>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <SchoolAvatar school={school} size={72} />
          <View style={styles.heroCopy}>
            <View style={styles.titleRow}>
              <AppText numberOfLines={2} style={styles.title} variant="title2">
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
          <View style={[styles.proofIcon, { backgroundColor: tint(proofColor, 0.09) }]}>
            <Ionicons
              color={proofColor}
              name={school.isVerified ? 'shield-checkmark' : 'information-circle'}
              size={22}
            />
          </View>
          <View style={styles.proofCopy}>
            <AppText variant="headline">
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
          <ListRow
            accessory={<Ionicons color={palette.muted} name="open-outline" size={15} />}
            leadingIcon="globe-outline"
            leadingIconColor={palette.bronze}
            onPress={() => void Linking.openURL(school.websiteUrl ?? '')}
            title={formatSwiftPlaceholders(t('Site de %@'), schoolDisplayName(school))}
          />
        ) : null}

        {affiliation ? (
          <>
            <AffiliationStatusCard affiliation={{ ...affiliation, school }} />
            <DispoButton
              icon="chatbubbles-outline"
              onPress={() => router.push(`/schools/${school.id}/community` as never)}
            >
              {t('Ouvrir la communauté')}
            </DispoButton>
            <DispoButton
              icon="create-outline"
              onPress={() => router.push(`/schools/${school.id}/join` as never)}
              variant="secondary"
            >
              {t('Modifier mon affiliation')}
            </DispoButton>

            <SectionHeader
              action={{
                label: formatSwiftPlaceholders(t('Voir les %lld'), affiliation.memberCount),
                onPress: () => router.push(`/schools/${school.id}/members` as never),
              }}
              title={t('Membres')}
            />
            {members.isLoading ? <LoadingState label={t('Chargement des membres…')} /> : null}
            {members.isError ? (
              <ErrorState
                message={t('Cette liste est réservée aux affiliations actives.')}
                onRetry={() => void members.refetch()}
              />
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
              <AppText variant="headline">{t('Ajouter mon école de musique')}</AppText>
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
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  heroCopy: { flex: 1, gap: spacing.tight },
  joinCopy: { gap: spacing.xs },
  proofCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  proofCopy: { flex: 1, gap: spacing.xxs },
  proofIcon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  title: { flexShrink: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
});
