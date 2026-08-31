import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  canCompleteOnboarding,
  countryOptions,
  emptyOnboardingDraft,
  hasCompletePlace,
  instrumentCategories,
  languageOptions,
  levelOptions,
  toggleInstrument,
  type CountryOption,
  type OnboardingDraft,
} from './onboarding-model';
import { fetchOnboardingDraft, saveOnboardingDraft } from './onboarding-service';

import { AppText } from '@/components/ui/app-text';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { signOut } from '@/features/auth/auth-service';
import { PostalPlaceField } from '@/features/location';
import { profileKeys } from '@/features/profiles/profile-queries';
import i18n, { setAppLanguage, type SupportedLocale } from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, typography } from '@/theme/tokens';

const stepCount = 4;

interface StepFrameProps {
  children: ReactNode;
  icon: ComponentProps<typeof Ionicons>['name'];
  subtitle: string;
  title: string;
}

function StepFrame({ children, icon, subtitle, title }: StepFrameProps) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.stepFrame}>
      <View style={styles.stepHeading}>
        <View style={[styles.stepIcon, { backgroundColor: `${palette.electric}20` }]}>
          <Ionicons color={palette.text} name={icon} size={25} />
        </View>
        <AppText style={styles.stepTitle}>{title}</AppText>
        <AppText color={palette.muted} style={styles.stepSubtitle} variant="caption">
          {subtitle}
        </AppText>
      </View>
      {children}
    </View>
  );
}

function SelectionPill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectionPill,
        {
          backgroundColor: active ? `${palette.electric}24` : palette.card,
          borderColor: active ? `${palette.electric}99` : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <AppText numberOfLines={1} style={styles.pillLabel} variant="caption">
        {label}
      </AppText>
    </Pressable>
  );
}

export function OnboardingScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(emptyOnboardingDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [countryModal, setCountryModal] = useState(false);
  const selectedCountry = useMemo(
    () => countryOptions.find((country) => country.code === draft.country) ?? countryOptions[0],
    [draft.country],
  );
  const canFinish = canCompleteOnboarding(draft);
  const disabled = saving || (step === 2 && !hasCompletePlace(draft)) || (step === 3 && !canFinish);

  useEffect(() => {
    let active = true;
    if (!session) return;
    void fetchOnboardingDraft(session.user.id)
      .then((value) => {
        if (active) setDraft(value);
      })
      .catch(() => {
        if (active) setErrorText(t('Ton profil ne peut pas être chargé pour le moment.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session, t]);

  const chooseLanguage = (locale: SupportedLocale) => {
    void setAppLanguage(locale);
  };

  const finish = async () => {
    if (!session || !canFinish || saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      await saveOnboardingDraft(session.user.id, draft);
      await queryClient.invalidateQueries({ queryKey: profileKeys.me(session.user.id) });
      router.replace('/(tabs)');
    } catch {
      setErrorText(t("Impossible d'enregistrer ton profil — vérifie le réseau."));
    } finally {
      setSaving(false);
    }
  };

  const changeAccount = () => {
    Alert.alert(
      t('Se connecter avec un autre compte ?'),
      t("Tu reviendras à l'écran de connexion. Aucune donnée de tes comptes ne sera supprimée."),
      [
        { text: t('Rester sur ce compte'), style: 'cancel' },
        {
          text: t('Changer de compte'),
          style: 'destructive',
          onPress: () => {
            void signOut().then(() => router.replace('/(auth)/sign-in'));
          },
        },
      ],
    );
  };

  if (!session) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <AppText style={styles.stepTitle}>{t('Connecte-toi pour créer ton profil')}</AppText>
          <DispoButton onPress={() => router.replace('/(auth)/sign-in')}>
            {t('Se connecter')}
          </DispoButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <View accessibilityLabel={t('Dispo')} style={styles.brand}>
            <Image
              accessibilityIgnoresInvertColors
              contentFit="contain"
              source={require('../../../assets/images/dispo/logo-mark.png')}
              style={styles.logo}
            />
            <AppText color={palette.electric} style={styles.wordmark} variant="displayItalic">
              dispo
            </AppText>
          </View>
          <Pressable
            accessibilityLabel={t('Changer de compte')}
            onPress={changeAccount}
            style={({ pressed }) => [
              styles.switchAccount,
              { backgroundColor: `${palette.electric}18` },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={palette.electric} name="person-circle-outline" size={17} />
            <AppText color={palette.electric} style={styles.switchAccountText} variant="caption">
              {t('Changer de compte')}
            </AppText>
          </Pressable>
        </View>

        <View style={styles.progress}>
          {Array.from({ length: stepCount }, (_, index) => (
            <View
              key={index}
              style={[
                styles.progressSegment,
                { backgroundColor: index <= step ? palette.electric : `${palette.electric}38` },
              ]}
            />
          ))}
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <AppText color={palette.muted}>{t('Chargement…')}</AppText>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 0 ? (
              <StepFrame
                icon="globe-outline"
                subtitle={t('Tu pourras la changer à tout moment dans ton profil.')}
                title={t('Choisis ta langue')}
              >
                <View style={styles.languageList}>
                  {languageOptions.map((language) => {
                    const selected = i18n.resolvedLanguage === language.locale;
                    return (
                      <Pressable
                        key={language.locale}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => chooseLanguage(language.locale)}
                        style={({ pressed }) => [
                          styles.languageRow,
                          {
                            backgroundColor: selected ? `${palette.electric}24` : palette.card,
                            borderColor: selected ? `${palette.electric}99` : palette.border,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText style={styles.flag}>{language.flag}</AppText>
                        <AppText style={styles.languageName}>{language.nativeName}</AppText>
                        <View style={styles.spacer} />
                        {selected ? (
                          <Ionicons color={palette.electric} name="checkmark-circle" size={20} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </StepFrame>
            ) : null}

            {step === 1 ? (
              <StepFrame
                icon="flash"
                subtitle={t('Dispo trouve un remplaçant fiable en quelques minutes.')}
                title={t('Un musicien te lâche ?')}
              >
                <View style={styles.conceptList}>
                  {[
                    {
                      icon: 'flash' as const,
                      title: t('SOS en 30 secondes'),
                      text: t(
                        'Publie « cherche bassiste samedi » — les musiciens dispo et compatibles répondent direct.',
                      ),
                    },
                    {
                      icon: 'videocam' as const,
                      title: t("Écoute avant d'engager"),
                      text: t(
                        'Ajoute des vidéos de démo à ton profil. On entend le niveau et le style — zéro mauvaise surprise.',
                      ),
                    },
                    {
                      icon: 'people' as const,
                      title: t("Ton réseau d'abord"),
                      text: t(
                        'Suis les musiciens fiables : tes amis et abonnés remontent en premier dans tes recherches.',
                      ),
                    },
                  ].map((item) => (
                    <View
                      key={item.title}
                      style={[styles.conceptRow, { backgroundColor: palette.card }]}
                    >
                      <View
                        style={[styles.conceptIcon, { backgroundColor: `${palette.electric}20` }]}
                      >
                        <Ionicons color={palette.text} name={item.icon} size={19} />
                      </View>
                      <View style={styles.conceptCopy}>
                        <AppText style={styles.conceptTitle}>{item.title}</AppText>
                        <AppText color={palette.muted} variant="caption">
                          {item.text}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              </StepFrame>
            ) : null}

            {step === 2 ? (
              <StepFrame
                icon="location-outline"
                subtitle={t('On te montre les musiciens et les concerts autour de toi.')}
                title={t('Où joues-tu ?')}
              >
                <View
                  style={[
                    styles.placeCard,
                    { backgroundColor: palette.card, borderColor: palette.border },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setCountryModal(true)}
                    style={({ pressed }) => [
                      styles.countryButton,
                      { backgroundColor: palette.inset },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText style={styles.flag}>{selectedCountry?.flag ?? '🌍'}</AppText>
                    <View style={styles.countryCopy}>
                      <AppText color={palette.muted} variant="caption">
                        {t('Pays')}
                      </AppText>
                      <AppText style={styles.languageName}>
                        {t(selectedCountry?.label ?? draft.country)}
                      </AppText>
                    </View>
                    <Ionicons color={palette.muted} name="chevron-down" size={18} />
                  </Pressable>
                  <PostalPlaceField
                    onChange={(place) =>
                      setDraft((value) => ({
                        ...value,
                        city: place.city,
                        country: place.countryCode,
                        postalCode: place.postalCode,
                      }))
                    }
                    value={{
                      city: draft.city,
                      countryCode: draft.country,
                      postalCode: draft.postalCode,
                    }}
                  />
                </View>
                <View style={styles.hint}>
                  <Ionicons color={palette.muted} name="sparkles" size={14} />
                  <AppText color={palette.muted} style={styles.hintText} variant="caption">
                    {t("Entre ton code postal, c'est tout.")}
                  </AppText>
                </View>
              </StepFrame>
            ) : null}

            {step === 3 ? (
              <StepFrame
                icon="person-circle-outline"
                subtitle={t('Nom, instruments, niveau — le reste se complète plus tard.')}
                title={t('Présente-toi')}
              >
                <TextInput
                  autoCapitalize="words"
                  onChangeText={(name) => setDraft((value) => ({ ...value, name }))}
                  placeholder={t('Ton nom de scène')}
                  placeholderTextColor={palette.muted}
                  style={[
                    styles.input,
                    styles.nameInput,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                      color: palette.text,
                    },
                  ]}
                  value={draft.name}
                />
                <View style={styles.instrumentViewport}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {instrumentCategories.map((category) => (
                      <View key={category.label} style={styles.instrumentSection}>
                        <View style={styles.categoryHeader}>
                          <Ionicons color={palette.muted} name={category.icon} size={12} />
                          <AppText
                            color={palette.muted}
                            style={styles.categoryLabel}
                            variant="caption"
                          >
                            {t(category.label)}
                          </AppText>
                        </View>
                        <View style={styles.instrumentGrid}>
                          {category.instruments.map((instrument) => (
                            <View key={instrument} style={styles.instrumentCell}>
                              <SelectionPill
                                active={draft.instruments.includes(instrument)}
                                label={t(instrument)}
                                onPress={() =>
                                  setDraft((value) => ({
                                    ...value,
                                    instruments: toggleInstrument(value.instruments, instrument),
                                  }))
                                }
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.levelRow}>
                  {levelOptions.map((level) => (
                    <View key={level} style={styles.levelCell}>
                      <SelectionPill
                        active={draft.level === level}
                        label={t(level === 'Professionnel' ? 'Pro' : level)}
                        onPress={() => setDraft((value) => ({ ...value, level }))}
                      />
                    </View>
                  ))}
                </View>
              </StepFrame>
            ) : null}
          </ScrollView>
        )}

        {errorText ? (
          <AppText color={palette.error} style={styles.errorText} variant="caption">
            {errorText}
          </AppText>
        ) : null}

        {!loading ? (
          <View style={[styles.footer, { backgroundColor: palette.background }]}>
            {step > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setStep((value) => Math.max(0, value - 1))}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.muted} name="chevron-back" size={19} />
              </Pressable>
            ) : null}
            <View style={styles.footerAction}>
              <DispoButton
                disabled={disabled}
                icon={step === stepCount - 1 ? 'flash' : 'arrow-forward'}
                loading={saving}
                onPress={() => {
                  if (step < stepCount - 1) setStep((value) => value + 1);
                  else void finish();
                }}
              >
                {step < stepCount - 1 ? t('Continuer') : t("C'est parti")}
              </DispoButton>
            </View>
          </View>
        ) : null}

        <Modal
          animationType="slide"
          onRequestClose={() => setCountryModal(false)}
          presentationStyle="pageSheet"
          visible={countryModal}
        >
          <Screen>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>{t('Choisis ton pays')}</AppText>
              <Pressable onPress={() => setCountryModal(false)}>
                <AppText color={palette.electric} style={styles.doneText}>
                  {t('OK')}
                </AppText>
              </Pressable>
            </View>
            <FlatList
              contentContainerStyle={styles.countryList}
              data={[...countryOptions] as CountryOption[]}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setDraft((value) => ({ ...value, country: item.code }));
                    setCountryModal(false);
                  }}
                  style={({ pressed }) => [
                    styles.countryRow,
                    { borderBottomColor: palette.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText style={styles.flag}>{item.flag}</AppText>
                  <AppText style={styles.countryRowLabel}>{t(item.label)}</AppText>
                  {draft.country === item.code ? (
                    <Ionicons color={palette.electric} name="checkmark-circle" size={21} />
                  ) : null}
                </Pressable>
              )}
            />
          </Screen>
        </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 42,
  },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  categoryHeader: { alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 8 },
  categoryLabel: { fontSize: 10, fontWeight: '800' },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  cityInput: { flex: 1 },
  conceptCopy: { flex: 1, gap: 3 },
  conceptIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  conceptList: { gap: 14 },
  conceptRow: {
    alignItems: 'flex-start',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  conceptTitle: { fontSize: 14, fontWeight: '900', lineHeight: 18 },
  countryButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
    paddingHorizontal: 14,
  },
  countryCopy: { flex: 1, gap: 1 },
  countryList: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  countryRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
  },
  countryRowLabel: { flex: 1, fontWeight: '700' },
  doneText: { fontWeight: '800' },
  errorText: { paddingHorizontal: 28, paddingTop: 4, textAlign: 'center' },
  flag: { fontSize: 20, lineHeight: 24 },
  flex: { flex: 1 },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: Platform.OS === 'android' ? spacing.md : spacing.lg,
    paddingHorizontal: 28,
    paddingTop: spacing.sm,
  },
  footerAction: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  hint: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  hintText: { fontWeight: '600' },
  input: {
    borderRadius: 14,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  instrumentCell: { width: '32%' },
  instrumentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  instrumentSection: { marginBottom: 12 },
  instrumentViewport: { maxHeight: 248 },
  languageList: { gap: 10 },
  languageName: { fontSize: 14, fontWeight: '800' },
  languageRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  levelCell: { flex: 1 },
  levelRow: { flexDirection: 'row', gap: 7 },
  logo: { height: 32, width: 32 },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalTitle: { fontSize: 17, fontWeight: '900' },
  nameInput: { borderWidth: 1 },
  pillLabel: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  placeCard: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 14 },
  placeInputs: { flexDirection: 'row', gap: 10 },
  postalInput: { width: 118 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 28, paddingTop: 10 },
  progressSegment: { borderRadius: radii.round, flex: 1, height: 4 },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.md },
  selectionPill: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  spacer: { flex: 1 },
  stepFrame: { flex: 1, gap: 20, paddingHorizontal: 24, paddingTop: 18 },
  stepHeading: { alignItems: 'center', gap: 9 },
  stepIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  stepSubtitle: { maxWidth: 330, paddingHorizontal: 12, textAlign: 'center' },
  stepTitle: { fontSize: 22, fontWeight: '900', lineHeight: 28, textAlign: 'center' },
  switchAccount: {
    alignItems: 'center',
    borderRadius: radii.round,
    flexDirection: 'row',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 11,
  },
  switchAccountText: { fontWeight: '800' },
  wordmark: { fontFamily: typography.displayItalic, fontSize: 23, lineHeight: 28 },
});
