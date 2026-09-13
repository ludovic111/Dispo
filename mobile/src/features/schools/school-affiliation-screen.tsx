import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { SchoolAvatar } from './school-components';
import {
  normalizeSchoolAffiliationInput,
  schoolErrorMessage,
  schoolRoleLabel,
  schoolRoles,
  schoolVisibilities,
  schoolVisibilityLabel,
  type SchoolRole,
  type SchoolVisibility,
} from './school-model';
import {
  useLeaveSchool,
  useMySchoolAffiliations,
  useSaveSchoolAffiliation,
  useSchool,
} from './school-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, ModalHeader, Screen } from '@/components/ui/screen';
import { HeaderAction, SectionHeader } from '@/components/ui/section';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, tint } from '@/theme/tokens';

export function SchoolAffiliationScreen({ schoolId }: { schoolId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const schoolQuery = useSchool(schoolId);
  const mine = useMySchoolAffiliations();
  const saveMutation = useSaveSchoolAffiliation();
  const leaveMutation = useLeaveSchool();
  const [role, setRole] = useState<SchoolRole>('student');
  const [visibility, setVisibility] = useState<SchoolVisibility>('school_only');
  const [roleLabel, setRoleLabel] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const didPrefill = useRef(false);
  const affiliation = mine.data?.find((item) => item.school.id === schoolId) ?? null;
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/schools' as never);
  };
  const closeAction = <HeaderAction icon="close" label={t('Fermer')} onPress={close} />;

  useEffect(() => {
    if (!affiliation || didPrefill.current) return;
    didPrefill.current = true;
    setRole(affiliation.role);
    setVisibility(affiliation.visibility);
    setRoleLabel(affiliation.roleLabel ?? '');
  }, [affiliation]);

  if (schoolQuery.isLoading || mine.isLoading) {
    return (
      <Screen>
        <View style={styles.stateHeader}>{closeAction}</View>
        <LoadingState label={t('Chargement de l’affiliation…')} />
      </Screen>
    );
  }
  const loadError = schoolQuery.error ?? mine.error;
  if (loadError) {
    return (
      <Screen>
        <View style={styles.stateHeader}>{closeAction}</View>
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
      <Screen>
        <View style={styles.stateHeader}>{closeAction}</View>
        <ErrorState message={t('École introuvable.')} />
      </Screen>
    );
  }

  const save = async () => {
    setErrorText(null);
    try {
      const input = normalizeSchoolAffiliationInput(school.id, { role, roleLabel, visibility });
      await saveMutation.mutateAsync(input);
      router.back();
    } catch (error) {
      setErrorText(t(schoolErrorMessage(error)));
    }
  };
  const roleLabelError =
    role === 'other' && roleLabel.trim().length === 0
      ? t('Précise ton rôle.')
      : roleLabel.trim().length > 80
        ? t('80 caractères maximum.')
        : undefined;
  const busy = saveMutation.isPending || leaveMutation.isPending;
  const disabled = busy || Boolean(roleLabelError);
  const confirmLeave = (changeSchool: boolean) => {
    if (busy) return;
    Alert.alert(
      t(changeSchool ? 'Changer d’école ?' : 'Quitter cette école ?'),
      t(
        changeSchool
          ? 'Tu vas quitter cette école, puis choisir la nouvelle dans l’annuaire. Tes autres affiliations seront conservées.'
          : 'Cette affiliation sera retirée de ton profil et tu n’auras plus accès à sa communauté. Tes autres écoles et ton compte seront conservés.',
      ),
      [
        { text: t('Annuler'), style: 'cancel' },
        {
          text: t(changeSchool ? 'Quitter et choisir' : 'Quitter l’école'),
          style: 'destructive',
          onPress: () => {
            setErrorText(null);
            void leaveMutation
              .mutateAsync(school.id)
              .then(() => router.replace(changeSchool ? '/schools' : '/(tabs)/profile'))
              .catch((error: unknown) =>
                Alert.alert(t('Impossible de quitter l’école'), t(schoolErrorMessage(error))),
              );
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ModalHeader
        leading={<NativeHeaderButton label={t('Annuler')} onPress={close} />}
        title={affiliation ? t('Modifier mon école') : t('Ajouter mon école')}
        trailing={
          <NativeHeaderButton
            disabled={disabled}
            label={
              saveMutation.isPending ? t('Envoi…') : affiliation ? t('Enregistrer') : t('Ajouter')
            }
            onPress={() => void save()}
          />
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={styles.schoolRow}>
            <SchoolAvatar school={school} size={52} />
            <View style={styles.schoolCopy}>
              <AppText numberOfLines={2} variant="headline">
                {school.name}
              </AppText>
              <AppText color={palette.muted} variant="caption">
                {school.city} · {school.countryCode.toLocaleUpperCase()}
              </AppText>
            </View>
          </View>
        </Card>

        {affiliation ? (
          <View style={styles.section}>
            <DispoButton
              disabled={busy}
              icon="swap-horizontal-outline"
              onPress={() => confirmLeave(true)}
              variant="secondary"
            >
              {t('Changer d’école')}
            </DispoButton>
            <DispoButton disabled={busy} onPress={() => confirmLeave(false)} variant="danger">
              {leaveMutation.isPending ? t('Départ…') : t('Quitter cette école')}
            </DispoButton>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title={t('Lien avec l’école')} />
          <View style={styles.choices}>
            {schoolRoles.map((value) => (
              <ChoiceChip
                key={value}
                label={t(schoolRoleLabel(value))}
                onPress={() => {
                  setRole(value);
                  setErrorText(null);
                }}
                selected={role === value}
              />
            ))}
          </View>
          {role === 'other' ? (
            <FormField
              autoCapitalize="sentences"
              error={roleLabelError}
              label={t('Mon rôle')}
              maxLength={81}
              onChangeText={setRoleLabel}
              placeholder={t('Précise ton rôle')}
              value={roleLabel}
            />
          ) : null}
          <View style={[styles.notice, { backgroundColor: tint(palette.bronze, 0.08) }]}>
            <Ionicons color={palette.bronze} name="information-circle" size={16} />
            <AppText color={palette.muted} style={styles.noticeCopy} variant="caption">
              {t(
                'Le rôle est déclaré par toi. Il ne devient vérifié qu’après validation par l’établissement.',
              )}
            </AppText>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('Qui voit cette affiliation ?')} />
          <View style={styles.visibilityChoices}>
            {schoolVisibilities.map((value) => (
              <ChoiceChip
                key={value}
                icon={
                  value === 'profile'
                    ? 'person-outline'
                    : value === 'school_only'
                      ? 'people-outline'
                      : 'lock-closed-outline'
                }
                label={t(schoolVisibilityLabel(value))}
                onPress={() => setVisibility(value)}
                selected={visibility === value}
              />
            ))}
          </View>
          <AppText color={palette.muted} variant="caption">
            {t(
              'L’annuaire applique ces règles côté serveur. Une affiliation privée reste visible uniquement par toi.',
            )}
          </AppText>
        </View>

        <Card style={styles.primaryCard}>
          <View style={[styles.primaryIcon, { backgroundColor: tint(palette.bronze, 0.09) }]}>
            <Ionicons color={palette.bronze} name="star-outline" size={19} />
          </View>
          <View style={styles.primaryCopy}>
            <AppText variant="headline">{t('École principale')}</AppText>
            <AppText color={palette.muted} variant="caption">
              {affiliation?.isPrimary
                ? t('Cette école est actuellement principale sur ton profil.')
                : t('La première affiliation active devient automatiquement principale.')}
            </AppText>
          </View>
        </Card>

        {errorText ? (
          <View
            accessibilityLiveRegion="polite"
            style={[styles.error, { backgroundColor: tint(palette.signal, 0.09) }]}
          >
            <Ionicons color={palette.signal} name="warning" size={17} />
            <AppText color={palette.signal} style={styles.errorCopy} variant="caption">
              {errorText}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  content: { gap: spacing.lg, padding: spacing.gutter, paddingBottom: spacing.xxl },
  error: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  errorCopy: { flex: 1 },
  notice: {
    alignItems: 'flex-start',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  noticeCopy: { flex: 1 },
  primaryCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  primaryCopy: { flex: 1, gap: spacing.xxs },
  primaryIcon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  schoolCopy: { flex: 1, gap: spacing.xxs },
  schoolRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  section: { gap: spacing.sm },
  stateHeader: { alignItems: 'flex-end', paddingHorizontal: spacing.gutter },
  visibilityChoices: { gap: spacing.xs },
});
