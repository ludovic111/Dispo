import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { countryOptions, languageOptions, type CountryOption } from './onboarding-model';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { IconButton } from '@/components/ui/pressable';
import { ModalHeader, Screen } from '@/components/ui/screen';
import { PostalPlaceField } from '@/features/location';
import type { SupportedLocale } from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, pressedStyle, radii, spacing, tint } from '@/theme/tokens';

/** Barre d'en-tête des parcours d'onboarding : logo à gauche, action à droite. */
export function OnboardingHeader({ action }: { action: ReactNode }) {
  return (
    <View style={styles.header}>
      <BrandLogo markSize={28} />
      {action}
    </View>
  );
}

export function OnboardingProgress({ count, step }: { count: number; step: number }) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.progress}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            styles.progressSegment,
            {
              backgroundColor: index <= step ? palette.electric : tint(palette.electric, 0.22),
            },
          ]}
        />
      ))}
    </View>
  );
}

export function StepFrame({
  children,
  icon,
  subtitle,
  title,
}: {
  children: ReactNode;
  icon: ComponentProps<typeof Ionicons>['name'];
  subtitle: string;
  title: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.stepFrame}>
      <View style={styles.stepHeading}>
        <View style={[styles.stepIcon, { backgroundColor: tint(palette.electric, 0.12) }]}>
          <Ionicons color={palette.electric} name={icon} size={26} />
        </View>
        <AppText style={styles.centered} variant="title2">
          {title}
        </AppText>
        <AppText color={palette.muted} style={styles.stepSubtitle} variant="footnote">
          {subtitle}
        </AppText>
      </View>
      {children}
    </View>
  );
}

export function OnboardingLanguageList({
  onSelect,
  selectedLocale,
}: {
  onSelect: (locale: SupportedLocale) => void;
  selectedLocale: string | undefined;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.languageList}>
      {languageOptions.map((language) => {
        const selected = selectedLocale === language.locale;
        return (
          <Pressable
            key={language.locale}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(language.locale)}
            style={({ pressed }) => [
              styles.languageRow,
              {
                backgroundColor: selected ? tint(palette.electric, 0.14) : palette.card,
                borderColor: selected ? tint(palette.electric, 0.6) : palette.border,
              },
              pressed && pressedStyle,
            ]}
          >
            <AppText variant="body">{language.flag}</AppText>
            <AppText style={styles.grow} variant="subheadline" weight="semibold">
              {language.nativeName}
            </AppText>
            {selected ? (
              <Ionicons color={palette.electric} name="checkmark-circle" size={20} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const concepts = [
  {
    icon: 'flash' as const,
    text: 'Publie « cherche bassiste samedi » — les musiciens dispo et compatibles répondent direct.',
    title: 'SOS en 30 secondes',
  },
  {
    icon: 'videocam' as const,
    text: 'Ajoute des vidéos de démo à ton profil. On entend le niveau et le style — zéro mauvaise surprise.',
    title: "Écoute avant d'engager",
  },
  {
    icon: 'people' as const,
    text: 'Suis les musiciens fiables : tes amis et abonnés remontent en premier dans tes recherches.',
    title: "Ton réseau d'abord",
  },
] as const;

export function OnboardingConceptList() {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.conceptList}>
      {concepts.map((item) => (
        <Card key={item.title} padding={spacing.sm}>
          <View style={styles.conceptRow}>
            <View style={[styles.conceptIcon, { backgroundColor: tint(palette.electric, 0.12) }]}>
              <Ionicons color={palette.electric} name={item.icon} size={19} />
            </View>
            <View style={styles.conceptCopy}>
              <AppText variant="subheadline" weight="semibold">
                {t(item.title)}
              </AppText>
              <AppText color={palette.muted} variant="footnote">
                {t(item.text)}
              </AppText>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

export interface OnboardingPlace {
  city: string;
  countryCode: string;
  postalCode: string;
}

export function OnboardingPlaceCard({
  onChange,
  onPressCountry,
  place,
}: {
  onChange: (place: OnboardingPlace) => void;
  onPressCountry: () => void;
  place: OnboardingPlace;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const country = countryOptions.find((option) => option.code === place.countryCode);
  return (
    <>
      <Card style={styles.placeCard}>
        <Pressable
          accessibilityRole="button"
          onPress={onPressCountry}
          style={({ pressed }) => [
            styles.countryButton,
            { backgroundColor: palette.inset },
            pressed && pressedStyle,
          ]}
        >
          <AppText variant="body">{country?.flag ?? '🌍'}</AppText>
          <View style={styles.grow}>
            <AppText color={palette.muted} variant="caption">
              {t('Pays')}
            </AppText>
            <AppText variant="subheadline" weight="semibold">
              {t(country?.label ?? place.countryCode)}
            </AppText>
          </View>
          <Ionicons color={palette.muted} name="chevron-down" size={18} />
        </Pressable>
        <PostalPlaceField
          onChange={(next) =>
            onChange({
              city: next.city,
              countryCode: next.countryCode,
              postalCode: next.postalCode,
            })
          }
          value={place}
        />
      </Card>
      <View style={styles.hint}>
        <Ionicons color={palette.muted} name="sparkles" size={14} />
        <AppText color={palette.muted} style={styles.grow} variant="caption">
          {t("Entre ton code postal, c'est tout.")}
        </AppText>
      </View>
    </>
  );
}

export function CountryPickerModal({
  onClose,
  onSelect,
  selectedCode,
  visible,
}: {
  onClose: () => void;
  onSelect: (country: CountryOption) => void;
  selectedCode: string;
  visible: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <Screen>
        <ModalHeader
          title={t('Choisis ton pays')}
          trailing={<NativeHeaderButton label={t('OK')} onPress={onClose} />}
        />
        <FlatList
          contentContainerStyle={styles.countryList}
          data={[...countryOptions] as CountryOption[]}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: palette.border }]} />
          )}
          keyExtractor={(item) => item.code}
          renderItem={({ item }) => (
            <ListRow
              accessory={
                selectedCode === item.code ? (
                  <Ionicons color={palette.electric} name="checkmark-circle" size={21} />
                ) : (
                  <View />
                )
              }
              leading={<AppText variant="body">{item.flag}</AppText>}
              onPress={() => onSelect(item)}
              title={t(item.label)}
              tone="plain"
            />
          )}
        />
      </Screen>
    </Modal>
  );
}

/** Pied de parcours : retour optionnel à gauche, action principale à droite. */
export function OnboardingFooter({
  children,
  onBack,
}: {
  children: ReactNode;
  onBack?: () => void;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.footer, { backgroundColor: palette.background }]}>
      {onBack ? (
        <IconButton
          accessibilityLabel={t('Retour')}
          icon="chevron-back"
          iconColor={palette.muted}
          onPress={onBack}
          variant="plain"
        />
      ) : null}
      <View style={styles.grow}>{children}</View>
    </View>
  );
}

export function OnboardingError({ text }: { text: string | null }) {
  const { palette } = useDispoTheme();
  if (!text) return null;
  return (
    <AppText color={palette.error} style={styles.errorText} variant="caption">
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
  conceptCopy: { flex: 1, gap: spacing.xxs },
  conceptIcon: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  conceptList: { gap: spacing.sm },
  conceptRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  countryButton: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  countryList: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  errorText: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xxs, textAlign: 'center' },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  grow: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
  },
  hint: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  languageList: { gap: spacing.xs },
  languageRow: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  placeCard: { gap: spacing.sm },
  progress: {
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
  },
  progressSegment: { borderRadius: radii.round, flex: 1, height: 4 },
  separator: { height: StyleSheet.hairlineWidth },
  stepFrame: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  stepHeading: { alignItems: 'center', gap: spacing.xs },
  stepIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  stepSubtitle: { maxWidth: 330, paddingHorizontal: spacing.sm, textAlign: 'center' },
});
