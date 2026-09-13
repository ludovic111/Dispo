import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

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
import { hasCompletePlace } from './onboarding-model';
import {
  emptyOnboardingReplayPlace,
  loadOnboardingReplayPlace,
  onboardingReplayQueryKey,
  saveOnboardingReplayPlace,
  type OnboardingReplayPlace,
} from './onboarding-replay-storage';

import { DispoButton } from '@/components/ui/pressable';
import { LoadingState, Screen } from '@/components/ui/screen';
import i18n, { setAppLanguage, type SupportedLocale } from '@/i18n';
import { spacing } from '@/theme/tokens';

const introStepCount = 3;
const swiftProgressSegmentCount = 4;

export function OnboardingReplayScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const storedState = useQuery({
    queryFn: loadOnboardingReplayPlace,
    queryKey: onboardingReplayQueryKey,
    staleTime: Infinity,
  });
  const [step, setStep] = useState(0);
  const [place, setPlace] = useState<OnboardingReplayPlace | null>(null);
  const [countryModal, setCountryModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const currentPlace = place ?? storedState.data ?? emptyOnboardingReplayPlace;
  const locationComplete = hasCompletePlace(currentPlace);

  const chooseLanguage = (locale: SupportedLocale) => {
    void setAppLanguage(locale);
  };

  const closeReplay = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const complete = async () => {
    if (saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      await saveOnboardingReplayPlace(currentPlace);
      await queryClient.invalidateQueries({ queryKey: onboardingReplayQueryKey });
      closeReplay();
    } catch {
      setErrorText(t("Impossible d'enregistrer ce réglage de position."));
    } finally {
      setSaving(false);
    }
  };

  const continueFlow = () => {
    if (step < introStepCount - 1) setStep((value) => value + 1);
    else void complete();
  };

  if (storedState.isLoading) {
    return (
      <Screen>
        <LoadingState />
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
            <DispoButton onPress={closeReplay} size="compact" variant="ghost">
              {t('Fermer')}
            </DispoButton>
          }
        />
        <OnboardingProgress count={swiftProgressSegmentCount} step={step} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
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
                onChange={(nextPlace) =>
                  setPlace({
                    city: nextPlace.city,
                    country: nextPlace.countryCode,
                    postalCode: nextPlace.postalCode,
                  })
                }
                onPressCountry={() => setCountryModal(true)}
                place={{
                  city: currentPlace.city,
                  countryCode: currentPlace.country,
                  postalCode: currentPlace.postalCode,
                }}
              />
            </StepFrame>
          ) : null}
        </ScrollView>

        <OnboardingError text={errorText} />

        <OnboardingFooter
          {...(step > 0 ? { onBack: () => setStep((value) => Math.max(0, value - 1)) } : {})}
        >
          <DispoButton
            disabled={saving || (step === introStepCount - 1 && !locationComplete)}
            icon="arrow-forward"
            loading={saving}
            onPress={continueFlow}
          >
            {t('Continuer')}
          </DispoButton>
        </OnboardingFooter>

        <CountryPickerModal
          onClose={() => setCountryModal(false)}
          onSelect={(country) => {
            setPlace({ ...currentPlace, country: country.code });
            setCountryModal(false);
          }}
          selectedCode={currentPlace.country}
          visible={countryModal}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.md },
});
