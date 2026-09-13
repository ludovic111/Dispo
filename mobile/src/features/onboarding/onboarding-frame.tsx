import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  countryOptions,
  languageOptions,
  onboardingConcepts,
  type CountryOption,
} from './onboarding-model';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { IconButton } from '@/components/ui/pressable';
import { ModalHeader, Screen } from '@/components/ui/screen';
import { PostalPlaceField } from '@/features/location';
import { RaisedIconWell, SettingsDivider } from '@/features/settings/settings-components';
import type { SupportedLocale } from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { insetStyle, minimumTouchTarget, pressedStyle, radii, spacing, tint } from '@/theme/tokens';

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
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t('Étape {{step}} sur {{total}}', { step: step + 1, total: count })}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: count, min: 0, now: step + 1 }}
      style={styles.progress}
    >
      <View style={[styles.progressTrack, insetStyle(palette)]}>
        {Array.from({ length: count }, (_, index) => (
          <View
            key={index}
            style={[
              styles.progressSegment,
              {
                backgroundColor: index <= step ? palette.accent : tint(palette.accent, 0.16),
                borderTopColor: index <= step ? tint(palette.highlight, 0.6) : 'transparent',
              },
            ]}
          />
        ))}
      </View>
      <AppText color={palette.muted} variant="caption2">
        {t('Étape {{step}} sur {{total}}', { step: step + 1, total: count })}
      </AppText>
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
        <RaisedIconWell icon={icon} size="large" />
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
    <Card accessibilityRole="radiogroup" padding={0} style={styles.languageList} tone="inset">
      {languageOptions.map((language, index) => {
        const selected = selectedLocale === language.locale;
        return (
          <View key={language.locale} style={styles.languageRow}>
            {index > 0 ? <SettingsDivider /> : null}
            <ListRow
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              accessory={
                <Ionicons
                  color={selected ? palette.electric : palette.muted}
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={21}
                />
              }
              leading={<AppText variant="body">{language.flag}</AppText>}
              onPress={() => onSelect(language.locale)}
              title={language.nativeName}
              tone="plain"
            />
          </View>
        );
      })}
    </Card>
  );
}

/** Trois idées de Dispo en cartes à balayer, avec pastilles de position. */
export function OnboardingConceptCards() {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(Math.min(Math.max(next, 0), onboardingConcepts.length - 1));
  };
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.conceptList}>
      {width > 0 ? (
        <FlatList
          data={onboardingConcepts}
          decelerationRate="fast"
          horizontal
          keyExtractor={(item) => item.title}
          onMomentumScrollEnd={onScroll}
          onScroll={onScroll}
          pagingEnabled
          renderItem={({ item }) => (
            <View style={{ width }}>
              <Card padding={spacing.lg} style={styles.conceptCard} tone="elevated">
                <RaisedIconWell icon={item.icon} size="large" />
                <AppText style={styles.centered} variant="title2">
                  {t(item.title)}
                </AppText>
                <AppText color={palette.muted} style={styles.centered} variant="body">
                  {t(item.text)}
                </AppText>
              </Card>
            </View>
          )}
          scrollEventThrottle={32}
          showsHorizontalScrollIndicator={false}
        />
      ) : null}
      <View accessibilityElementsHidden style={styles.dots}>
        {onboardingConcepts.map((item, dotIndex) => (
          <View
            key={item.title}
            style={[
              styles.dot,
              {
                backgroundColor: dotIndex === index ? palette.accent : tint(palette.accent, 0.22),
                width: dotIndex === index ? spacing.lg : spacing.xs,
              },
            ]}
          />
        ))}
      </View>
      <AppText color={palette.muted} style={styles.centered} variant="caption">
        {t('Balaie pour découvrir les trois idées.')}
      </AppText>
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
      <Card style={styles.placeCard} tone="elevated">
        <Pressable
          accessibilityLabel={t('Pays')}
          accessibilityRole="button"
          onPress={onPressCountry}
          style={({ pressed }) => [
            styles.countryButton,
            insetStyle(palette),
            pressed && pressedStyle,
          ]}
        >
          <AppText variant="body">{country?.flag ?? '🌍'}</AppText>
          <View style={styles.grow}>
            <AppText color={palette.bronze} variant="label">
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
  conceptCard: { alignItems: 'center', gap: spacing.sm, minHeight: 260 },
  conceptList: { gap: spacing.sm },
  dot: { borderRadius: radii.round, height: spacing.xs },
  dots: { flexDirection: 'row', gap: spacing.tight, justifyContent: 'center' },
  countryButton: {
    alignItems: 'center',
    borderRadius: radii.input,
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
  languageList: { overflow: 'hidden' },
  languageRow: { paddingHorizontal: spacing.sm },
  placeCard: { gap: spacing.sm },
  progress: { gap: spacing.tight, paddingHorizontal: spacing.gutter, paddingTop: spacing.xs },
  progressSegment: { borderRadius: 2, borderTopWidth: 1, flex: 1, height: 6 },
  progressTrack: {
    borderRadius: radii.xs,
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: spacing.xxs,
  },
  separator: { height: StyleSheet.hairlineWidth },
  stepFrame: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  stepHeading: { alignItems: 'center', gap: spacing.xs },
  stepSubtitle: { maxWidth: 330, paddingHorizontal: spacing.sm, textAlign: 'center' },
});
