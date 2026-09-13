import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  levelOptions,
  onboardingSchoolRoles,
  setDraftInstrumentLevel,
  sortSchoolsForOnboarding,
  toggleDraftInstrument,
  toggleGenre,
  instrumentCategories,
  type MusicianLevel,
  type OnboardingDraft,
  type OnboardingSchoolRole,
} from './onboarding-model';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { shortProfileLevel } from '@/domain/profile';
import { GIG_GENRE_GROUPS } from '@/features/gigs/gig-model';
import { SubscriptionPlans } from '@/features/premium/subscription-plans';
import type { MusicSchool, SchoolAffiliation } from '@/features/schools/school-model';
import { schoolRoleLabel } from '@/features/schools/school-model';
import { RaisedIconWell } from '@/features/settings/settings-components';
import { useDispoTheme } from '@/theme/theme-context';
import { keyStyle, minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

type DraftPatch = (patch: Partial<OnboardingDraft>) => void;

export function IdentityStep({
  draft,
  error,
  onBlurName,
  onPickPhoto,
  patch,
  uploading,
}: {
  draft: OnboardingDraft;
  error: string | null;
  onBlurName: () => void;
  onPickPhoto: () => void;
  patch: DraftPatch;
  uploading: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.stack}>
      <View style={styles.photoBlock}>
        <Pressable
          accessibilityLabel={draft.photoUrl ? t('Changer la photo') : t('Ajouter une photo')}
          accessibilityRole="button"
          disabled={uploading}
          onPress={onPickPhoto}
          style={({ pressed }) => [styles.photoPressable, pressed && pressedStyle]}
        >
          <Avatar name={draft.name || '?'} size={96} uri={draft.photoUrl} />
          <View style={[styles.photoBadge, keyStyle(palette.accent, palette.accentDeep)]}>
            <Ionicons color={palette.accentInk} name="camera" size={14} />
          </View>
        </Pressable>
        <DispoButton
          disabled={uploading}
          icon="image-outline"
          loading={uploading}
          onPress={onPickPhoto}
          size="compact"
          variant="ghost"
        >
          {draft.photoUrl ? t('Changer la photo') : t('Ajouter une photo')}
        </DispoButton>
        <AppText color={palette.muted} style={styles.centered} variant="caption">
          {t('Facultatif — un visage donne trois fois plus de réponses.')}
        </AppText>
      </View>
      <FormField
        autoCapitalize="words"
        autoComplete="name"
        error={error ?? undefined}
        hint={t('Le nom que les musiciens verront sur ton profil.')}
        label={t('Nom')}
        onBlur={onBlurName}
        onChangeText={(name) => patch({ name })}
        placeholder={t('Ton nom de scène')}
        returnKeyType="done"
        textContentType="name"
        value={draft.name}
      />
    </View>
  );
}

export function InstrumentsStep({ draft, patch }: { draft: OnboardingDraft; patch: DraftPatch }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const toggle = (instrument: string) => patch(toggleDraftInstrument(draft, instrument));
  const setLevel = (instrument: string, level: MusicianLevel) =>
    patch({ instrumentLevels: setDraftInstrumentLevel(draft, instrument, level) });
  return (
    <View style={styles.stack}>
      {draft.instruments.length > 0 ? (
        <Card style={styles.levelCard} tone="elevated">
          <SectionHeader
            subtitle={t('Choisis ton niveau pour chaque instrument.')}
            title={t('Tes instruments')}
          />
          {draft.instruments.map((instrument) => (
            <View key={instrument} style={styles.levelRow}>
              <View style={styles.levelRowHeading}>
                <AppText style={styles.grow} variant="subheadline" weight="semibold">
                  {t(instrument)}
                </AppText>
                <Pressable
                  accessibilityLabel={t('Retirer {{instrument}}', { instrument: t(instrument) })}
                  accessibilityRole="button"
                  hitSlop={spacing.xs}
                  onPress={() => toggle(instrument)}
                  style={({ pressed }) => [styles.removeButton, pressed && pressedStyle]}
                >
                  <Ionicons color={palette.muted} name="close-circle" size={22} />
                </Pressable>
              </View>
              <View style={styles.chipWrap}>
                {levelOptions.map((level) => (
                  <ChoiceChip
                    key={level}
                    label={t(shortProfileLevel(level))}
                    onPress={() => setLevel(instrument, level)}
                    selected={(draft.instrumentLevels[instrument] ?? draft.level) === level}
                  />
                ))}
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      {instrumentCategories.map((category) => (
        <View key={category.label} style={styles.category}>
          <View style={styles.categoryHeader}>
            <Ionicons color={palette.bronze} name={category.icon} size={12} />
            <AppText color={palette.bronze} variant="label">
              {t(category.label)}
            </AppText>
          </View>
          <View style={styles.chipWrap}>
            {category.instruments.map((instrument) => (
              <ChoiceChip
                key={instrument}
                label={t(instrument)}
                onPress={() => toggle(instrument)}
                selected={draft.instruments.includes(instrument)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function StylesStep({ draft, patch }: { draft: OnboardingDraft; patch: DraftPatch }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.stack}>
      <AppText color={palette.muted} variant="footnote">
        {draft.genres.length > 0
          ? t('Styles choisis : {{total}} — tu pourras en ajouter plus tard.', {
              total: draft.genres.length,
            })
          : t('Facultatif, mais ça aide à te proposer les bons SOS.')}
      </AppText>
      {GIG_GENRE_GROUPS.map((group) => (
        <View key={group.label} style={styles.category}>
          <AppText color={palette.bronze} variant="label">
            {t(group.label)}
          </AppText>
          <View style={styles.chipWrap}>
            {group.values.map((genre) => (
              <ChoiceChip
                key={genre}
                label={t(genre)}
                onPress={() => patch({ genres: toggleGenre(draft.genres, genre) })}
                selected={draft.genres.includes(genre)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function SchoolStep({
  affiliations,
  error,
  loading,
  onRetry,
  onSelectRole,
  onSelectSchool,
  role,
  schools,
  selectedSchoolId,
}: {
  affiliations: readonly SchoolAffiliation[];
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  onSelectRole: (role: OnboardingSchoolRole) => void;
  onSelectSchool: (schoolId: string | null) => void;
  role: OnboardingSchoolRole;
  schools: readonly MusicSchool[];
  selectedSchoolId: string | null;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const sorted = useMemo(() => sortSchoolsForOnboarding(schools), [schools]);
  const active = affiliations.filter((affiliation) => affiliation.status === 'active');
  if (loading) return <LoadingState />;
  if (error) {
    return <ErrorState message={t('Les écoles ne peuvent pas être chargées.')} onRetry={onRetry} />;
  }
  if (active.length > 0) {
    return (
      <View style={styles.stack}>
        <Card tone="elevated">
          <SectionHeader title={t('Tu es déjà membre')} />
          {active.map((affiliation) => (
            <ListRow
              key={affiliation.id}
              leading={
                <Avatar name={affiliation.school.name} size={40} uri={affiliation.school.logoUrl} />
              }
              subtitle={t(schoolRoleLabel(affiliation.role))}
              title={affiliation.school.name}
              titleLines={2}
              tone="plain"
            />
          ))}
        </Card>
        <AppText color={palette.muted} style={styles.centered} variant="caption">
          {t('Tu pourras rejoindre une autre école depuis ton profil.')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      <Card padding={0} tone="elevated">
        {sorted.map((school) => {
          const selected = school.id === selectedSchoolId;
          return (
            <View key={school.id}>
              <ListRow
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessory={
                  <Ionicons
                    color={selected ? palette.electric : palette.muted}
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                  />
                }
                leading={<Avatar name={school.name} size={40} uri={school.logoUrl} />}
                onPress={() => onSelectSchool(selected ? null : school.id)}
                subtitle={school.city}
                title={school.name}
                titleLines={2}
                tone="plain"
              />
              {selected ? (
                <View style={styles.roleRow}>
                  {onboardingSchoolRoles.map((option) => (
                    <ChoiceChip
                      key={option}
                      label={t(schoolRoleLabel(option))}
                      onPress={() => onSelectRole(option)}
                      selected={role === option}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        <ListRow
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selectedSchoolId === null }}
          accessory={
            <Ionicons
              color={selectedSchoolId === null ? palette.electric : palette.muted}
              name={selectedSchoolId === null ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
            />
          }
          leadingIcon="musical-notes-outline"
          onPress={() => onSelectSchool(null)}
          title={t('Je ne suis pas dans une école')}
          tone="plain"
        />
      </Card>
      <AppText color={palette.muted} style={styles.centered} variant="caption">
        {t('Ton affiliation reste « déclarée » tant que l’école ne l’a pas confirmée.')}
      </AppText>
    </View>
  );
}

const notificationReasons = [
  { icon: 'flash' as const, text: 'Un SOS compatible avec tes instruments' },
  { icon: 'chatbubble-ellipses' as const, text: 'Un message ou une réponse à ta candidature' },
  { icon: 'calendar' as const, text: 'Une session de ton groupe qui change' },
];

export function NotificationsStep({
  onSkip,
  outcome,
}: {
  onSkip: () => void;
  outcome: 'blocked' | 'granted' | 'registration-failed' | null;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.stack}>
      <Card style={styles.reasonCard} tone="elevated">
        {notificationReasons.map((reason) => (
          <View key={reason.text} style={styles.reasonRow}>
            <RaisedIconWell icon={reason.icon} />
            <AppText style={styles.grow} variant="subheadline">
              {t(reason.text)}
            </AppText>
          </View>
        ))}
      </Card>
      {outcome === 'blocked' ? (
        <AppText color={palette.muted} style={styles.centered} variant="footnote">
          {t('Les notifications restent bloquées dans les réglages du téléphone.')}
        </AppText>
      ) : null}
      {outcome === 'registration-failed' ? (
        <AppText color={palette.muted} style={styles.centered} variant="footnote">
          {t(
            "Les alertes locales restent actives, mais ce téléphone n'a pas pu être inscrit aux alertes distantes.",
          )}
        </AppText>
      ) : null}
      {outcome === null ? (
        <DispoButton onPress={onSkip} size="compact" variant="ghost">
          {t('Plus tard')}
        </DispoButton>
      ) : null}
    </View>
  );
}

export function PlanStep() {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (Platform.OS !== 'ios') {
    return (
      <Card style={styles.stack} tone="elevated">
        <SectionHeader
          subtitle={t('Tout Dispo est gratuit pendant la bêta sur Android.')}
          title={t('Gratuit pour commencer')}
        />
        <AppText color={palette.muted} variant="footnote">
          {t(
            'Les formules Groupe et Premium arriveront sur Android avec les achats Google Play. Rien à faire pour l’instant.',
          )}
        </AppText>
      </Card>
    );
  }
  return (
    <View style={styles.stack}>
      <SubscriptionPlans />
      <AppText color={palette.muted} style={styles.centered} variant="caption">
        {t('Tu peux changer d’avis à tout moment dans Réglages → Abonnement.')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  category: { gap: spacing.xs },
  categoryHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  centered: { textAlign: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  grow: { flex: 1 },
  levelCard: { gap: spacing.sm },
  levelRow: { gap: spacing.xs },
  levelRowHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  photoBadge: {
    alignItems: 'center',
    borderRadius: radii.round,
    bottom: 0,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 28,
  },
  photoBlock: { alignItems: 'center', gap: spacing.xs },
  photoPressable: { alignSelf: 'center' },
  reasonCard: { gap: spacing.sm },
  reasonRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  removeButton: {
    alignItems: 'center',
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stack: { gap: spacing.md },
});
