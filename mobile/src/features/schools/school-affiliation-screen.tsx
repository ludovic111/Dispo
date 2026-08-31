import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
import { useMySchoolAffiliations, useSaveSchoolAffiliation, useSchool } from './school-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function SchoolAffiliationScreen({ schoolId }: { schoolId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const schoolQuery = useSchool(schoolId);
  const mine = useMySchoolAffiliations();
  const saveMutation = useSaveSchoolAffiliation();
  const [role, setRole] = useState<SchoolRole>('student');
  const [visibility, setVisibility] = useState<SchoolVisibility>('school_only');
  const [roleLabel, setRoleLabel] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const didPrefill = useRef(false);
  const affiliation = mine.data?.find((item) => item.school.id === schoolId) ?? null;

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
        <LoadingState label={t('Chargement de l’affiliation…')} />
      </Screen>
    );
  }
  const loadError = schoolQuery.error ?? mine.error;
  if (loadError) {
    return (
      <Screen>
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
  const disabled = saveMutation.isPending || Boolean(roleLabelError);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.headerSide}
        >
          <AppText color={palette.electric}>{t('Annuler')}</AppText>
        </Pressable>
        <AppText numberOfLines={1} style={styles.headerTitle}>
          {affiliation ? t('Modifier mon école') : t('Ajouter mon école')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => void save()}
          style={[styles.headerSide, styles.headerSave, disabled && styles.disabled]}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={palette.electric} size="small" />
          ) : (
            <AppText color={palette.electric} style={styles.saveLabel}>
              {affiliation ? t('Enregistrer') : t('Ajouter')}
            </AppText>
          )}
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={styles.schoolRow}>
            <SchoolAvatar school={school} size={52} />
            <View style={styles.schoolCopy}>
              <AppText style={styles.schoolName} variant="headline">
                {school.name}
              </AppText>
              <AppText color={palette.muted} variant="caption">
                {school.city} · {school.countryCode.toLocaleUpperCase()}
              </AppText>
            </View>
          </View>
        </Card>

        <View style={styles.section}>
          <AppText color={palette.bronze} variant="label">
            {t('Lien avec l’école')}
          </AppText>
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
          <View style={[styles.notice, { backgroundColor: `${palette.bronze}14` }]}>
            <Ionicons color={palette.bronze} name="information-circle" size={16} />
            <AppText color={palette.muted} style={styles.noticeCopy} variant="caption">
              {t(
                'Le rôle est déclaré par toi. Il ne devient vérifié qu’après validation par l’établissement.',
              )}
            </AppText>
          </View>
        </View>

        <View style={styles.section}>
          <AppText color={palette.bronze} variant="label">
            {t('Qui voit cette affiliation ?')}
          </AppText>
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
          <View style={[styles.primaryIcon, { backgroundColor: `${palette.bronze}18` }]}>
            <Ionicons color={palette.bronze} name="star-outline" size={19} />
          </View>
          <View style={styles.primaryCopy}>
            <AppText style={styles.primaryTitle} variant="subheadline">
              {t('École principale')}
            </AppText>
            <AppText color={palette.muted} variant="caption">
              {affiliation?.isPrimary
                ? t('Cette école est actuellement principale sur ton profil.')
                : t('La première affiliation active devient automatiquement principale.')}
            </AppText>
          </View>
        </Card>

        {errorText ? (
          <View
            style={[
              styles.error,
              { backgroundColor: `${palette.signal}18`, borderColor: `${palette.signal}55` },
            ]}
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
  disabled: { opacity: 0.45 },
  error: {
    alignItems: 'center',
    borderRadius: radii.ticket,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  errorCopy: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.gutter,
  },
  headerSave: { alignItems: 'flex-end' },
  headerSide: { minWidth: 82, paddingVertical: spacing.xs },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  notice: {
    alignItems: 'flex-start',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  noticeCopy: { flex: 1 },
  primaryCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  primaryCopy: { flex: 1, gap: 3 },
  primaryIcon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  primaryTitle: { fontWeight: '800' },
  saveLabel: { fontWeight: '800' },
  schoolCopy: { flex: 1, gap: 3 },
  schoolName: { fontWeight: '700' },
  schoolRow: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  section: { gap: spacing.sm },
  visibilityChoices: { gap: spacing.xs },
});
