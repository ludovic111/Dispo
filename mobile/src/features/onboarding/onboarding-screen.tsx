import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  CountryPickerModal,
  OnboardingConceptList,
  OnboardingError,
  OnboardingFooter,
  OnboardingHeader,
  OnboardingLanguageList,
  OnboardingPlaceCard,
  OnboardingProgress,
  StepFrame,
} from './onboarding-frame';
import {
  canCompleteOnboarding,
  emptyOnboardingDraft,
  hasCompletePlace,
  instrumentCategories,
  levelOptions,
  toggleInstrument,
  type OnboardingDraft,
} from './onboarding-model';
import { fetchOnboardingDraft, saveOnboardingDraft } from './onboarding-service';

import { AppText } from '@/components/ui/app-text';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { LoadingState, Screen } from '@/components/ui/screen';
import { communityContentMessage } from '@/domain/community-content';
import { shortProfileLevel } from '@/domain/profile';
import { useAuth } from '@/features/auth/auth-context';
import { signOut } from '@/features/auth/auth-service';
import { profileKeys } from '@/features/profiles/profile-queries';
import { disconnectWithBestEffortPushCleanup } from '@/features/settings/account-session';
import { unregisterPushDevice } from '@/features/settings/settings-service';
import { clearPushToken, loadPushToken } from '@/features/settings/settings-storage';
import i18n, { setAppLanguage, type SupportedLocale } from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const stepCount = 4;

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
    } catch (error) {
      setErrorText(
        t(
          communityContentMessage(
            error,
            "Impossible d'enregistrer ton profil — vérifie le réseau.",
          ),
        ),
      );
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
            void disconnectWithBestEffortPushCleanup({
              clearPushToken,
              loadPushToken,
              signOut,
              unregisterPushDevice,
            }).then(() => router.replace('/(auth)/sign-in'));
          },
        },
      ],
    );
  };

  if (!session) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <AppText style={styles.centered} variant="title2">
            {t('Connecte-toi pour créer ton profil')}
          </AppText>
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
        <OnboardingHeader
          action={
            <DispoButton
              icon="person-circle-outline"
              onPress={changeAccount}
              size="compact"
              variant="ghost"
            >
              {t('Changer de compte')}
            </DispoButton>
          }
        />
        <OnboardingProgress count={stepCount} step={step} />

        {loading ? (
          <LoadingState />
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
                <OnboardingLanguageList
                  onSelect={chooseLanguage}
                  selectedLocale={i18n.resolvedLanguage}
                />
              </StepFrame>
            ) : null}

            {step === 1 ? (
              <StepFrame
                icon="flash"
                subtitle={t('Dispo trouve un remplaçant fiable en quelques minutes.')}
                title={t('Un musicien te lâche ?')}
              >
                <OnboardingConceptList />
              </StepFrame>
            ) : null}

            {step === 2 ? (
              <StepFrame
                icon="location-outline"
                subtitle={t('On te montre les musiciens et les concerts autour de toi.')}
                title={t('Où joues-tu ?')}
              >
                <OnboardingPlaceCard
                  onChange={(place) =>
                    setDraft((value) => ({
                      ...value,
                      city: place.city,
                      country: place.countryCode,
                      postalCode: place.postalCode,
                    }))
                  }
                  onPressCountry={() => setCountryModal(true)}
                  place={{
                    city: draft.city,
                    countryCode: draft.country,
                    postalCode: draft.postalCode,
                  }}
                />
              </StepFrame>
            ) : null}

            {step === 3 ? (
              <StepFrame
                icon="person-circle-outline"
                subtitle={t('Nom, instruments, niveau — le reste se complète plus tard.')}
                title={t('Présente-toi')}
              >
                <FormField
                  autoCapitalize="words"
                  label={t('Nom')}
                  onChangeText={(name) => setDraft((value) => ({ ...value, name }))}
                  placeholder={t('Ton nom de scène')}
                  value={draft.name}
                />
                <View style={styles.instrumentViewport}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {instrumentCategories.map((category) => (
                      <View key={category.label} style={styles.instrumentSection}>
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
                              onPress={() =>
                                setDraft((value) => ({
                                  ...value,
                                  instruments: toggleInstrument(value.instruments, instrument),
                                }))
                              }
                              selected={draft.instruments.includes(instrument)}
                            />
                          ))}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.chipWrap}>
                  {levelOptions.map((level) => (
                    <ChoiceChip
                      key={level}
                      label={t(shortProfileLevel(level))}
                      onPress={() => setDraft((value) => ({ ...value, level }))}
                      selected={draft.level === level}
                    />
                  ))}
                </View>
              </StepFrame>
            ) : null}
          </ScrollView>
        )}

        <OnboardingError text={errorText} />

        {!loading ? (
          <OnboardingFooter
            {...(step > 0 ? { onBack: () => setStep((value) => Math.max(0, value - 1)) } : {})}
          >
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
          </OnboardingFooter>
        ) : null}

        <CountryPickerModal
          onClose={() => setCountryModal(false)}
          onSelect={(country) => {
            setDraft((value) => ({ ...value, country: country.code }));
            setCountryModal(false);
          }}
          selectedCode={draft.country}
          visible={countryModal}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  categoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.tight,
    marginBottom: spacing.xs,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centered: { textAlign: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  flex: { flex: 1 },
  instrumentSection: { marginBottom: spacing.sm },
  instrumentViewport: { maxHeight: 248 },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.md },
});
