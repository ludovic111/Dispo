import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  clearOnboardingProgress,
  loadOnboardingProgress,
  saveOnboardingProgress,
} from './onboarding-draft-storage';
import {
  CountryPickerModal,
  OnboardingConceptCards,
  OnboardingError,
  OnboardingFooter,
  OnboardingHeader,
  OnboardingLanguageList,
  OnboardingPlaceCard,
  OnboardingProgress,
  StepFrame,
} from './onboarding-frame';
import {
  emptyOnboardingDraft,
  mergeResumedDraft,
  onboardingStepIssue,
  onboardingStepIssueMessage,
  onboardingSteps,
  resumeStepIndex,
  type OnboardingDraft,
  type OnboardingSchoolRole,
  type OnboardingStep,
} from './onboarding-model';
import {
  enableNotificationsDuringOnboarding,
  type OnboardingNotificationOutcome,
} from './onboarding-notifications';
import { pickAndUploadOnboardingPhoto } from './onboarding-photo';
import { fetchOnboardingDraft, saveOnboardingDraft } from './onboarding-service';
import {
  IdentityStep,
  InstrumentsStep,
  NotificationsStep,
  PlanStep,
  SchoolStep,
  StylesStep,
} from './onboarding-steps';
import { OnboardingStepTransition } from './onboarding-transition';

import { AppText } from '@/components/ui/app-text';
import { DispoButton } from '@/components/ui/pressable';
import { LoadingState, Screen } from '@/components/ui/screen';
import { communityContentMessage } from '@/domain/community-content';
import { useAuth } from '@/features/auth/auth-context';
import { signOut } from '@/features/auth/auth-service';
import { profileKeys } from '@/features/profiles/profile-queries';
import { normalizeSchoolAffiliationInput } from '@/features/schools/school-model';
import {
  useMySchoolAffiliations,
  useSaveSchoolAffiliation,
  useSchoolDirectory,
} from '@/features/schools/school-queries';
import { disconnectWithBestEffortPushCleanup } from '@/features/settings/account-session';
import { unregisterPushDevice } from '@/features/settings/settings-service';
import { clearPushToken, loadPushToken } from '@/features/settings/settings-storage';
import i18n, { setAppLanguage, type SupportedLocale } from '@/i18n';
import { spacing } from '@/theme/tokens';

const stepCount = onboardingSteps.length;
const persistDelayMs = 250;

type StepCopy = {
  icon: Parameters<typeof StepFrame>[0]['icon'];
  subtitle: string;
  title: string;
};

const stepCopy: Record<OnboardingStep, StepCopy> = {
  concepts: {
    icon: 'flash',
    subtitle: 'SOS, groupes, écoles : tout ce qui compte pour jouer plus.',
    title: 'Dispo en 3 idées',
  },
  identity: {
    icon: 'person-circle-outline',
    subtitle: 'Ton nom et, si tu veux, une photo. Le reste se complète plus tard.',
    title: 'Présente-toi',
  },
  instruments: {
    icon: 'musical-notes-outline',
    subtitle: 'Choisis tout ce que tu joues, puis ton niveau sur chacun.',
    title: 'Tes instruments',
  },
  language: {
    icon: 'globe-outline',
    subtitle: 'Tu pourras la changer à tout moment dans ton profil.',
    title: 'Choisis ta langue',
  },
  notifications: {
    icon: 'notifications-outline',
    subtitle: 'Un SOS compatible ne prévient pas : sois averti·e à temps.',
    title: 'Ne rate aucun SOS',
  },
  place: {
    icon: 'location-outline',
    subtitle: 'On te montre les musiciens et les concerts autour de toi.',
    title: 'Où joues-tu ?',
  },
  plan: {
    icon: 'sparkles-outline',
    subtitle: 'Commence gratuitement, passe à Groupe ou Premium quand tu en as besoin.',
    title: 'Choisis ta formule',
  },
  school: {
    icon: 'school-outline',
    subtitle: 'Retrouve les élèves et les profs de ton école dans Dispo.',
    title: 'Tu es membre d’une école ?',
  },
  styles: {
    icon: 'color-palette-outline',
    subtitle: 'Les styles que tu joues ou que tu veux jouer.',
    title: 'Tes styles',
  },
};

export function OnboardingScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'backward' | 'forward'>('forward');
  const [draft, setDraft] = useState<OnboardingDraft>(emptyOnboardingDraft);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolRole, setSchoolRole] = useState<OnboardingSchoolRole>('student');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [notificationOutcome, setNotificationOutcome] =
    useState<OnboardingNotificationOutcome | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [countryModal, setCountryModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const hydrated = useRef(false);

  const step = onboardingSteps[stepIndex] ?? 'language';
  const issue = onboardingStepIssue(step, draft);
  const schools = useSchoolDirectory();
  const affiliations = useMySchoolAffiliations();
  const joinSchool = useSaveSchoolAffiliation();

  useEffect(() => {
    let active = true;
    if (!userId) return;
    void Promise.all([fetchOnboardingDraft(userId), loadOnboardingProgress(userId)])
      .then(([server, stored]) => {
        if (!active) return;
        const resumed = stored ? mergeResumedDraft(server, stored.draft) : server;
        setDraft(resumed);
        if (stored) {
          setStepIndex(resumeStepIndex(stored.step, resumed));
          setSchoolId(stored.schoolId);
          setSchoolRole(stored.schoolRole);
        }
      })
      .catch(() => {
        if (active) setErrorText(t('Ton profil ne peut pas être chargé pour le moment.'));
      })
      .finally(() => {
        if (active) {
          hydrated.current = true;
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [t, userId]);

  useEffect(() => {
    if (!hydrated.current || !userId) return;
    const timer = setTimeout(() => {
      void saveOnboardingProgress({ draft, schoolId, schoolRole, step: stepIndex, userId }).catch(
        () => undefined,
      );
    }, persistDelayMs);
    return () => clearTimeout(timer);
  }, [draft, schoolId, schoolRole, stepIndex, userId]);

  const goTo = useCallback((next: number, nextDirection: 'backward' | 'forward') => {
    setDirection(nextDirection);
    setErrorText(null);
    setStepIndex(next);
    scrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, []);

  const goBack = useCallback(() => {
    if (stepIndex === 0) return false;
    goTo(stepIndex - 1, 'backward');
    return true;
  }, [goTo, stepIndex]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack]);

  const patch = useCallback((value: Partial<OnboardingDraft>) => {
    setDraft((current) => ({ ...current, ...value }));
  }, []);

  const chooseLanguage = (locale: SupportedLocale) => {
    void setAppLanguage(locale);
  };

  const pickPhoto = async () => {
    if (!userId || uploading) return;
    setUploading(true);
    setErrorText(null);
    try {
      const photoUrl = await pickAndUploadOnboardingPhoto(userId);
      if (photoUrl) {
        patch({ photoUrl });
        await queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) });
      }
    } catch {
      setErrorText(t("La photo n'a pas pu être enregistrée."));
    } finally {
      setUploading(false);
    }
  };

  const finish = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      await saveOnboardingDraft(userId, draft);
      await clearOnboardingProgress();
      await queryClient.invalidateQueries({ queryKey: profileKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['onboarding', 'status', userId] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const leaveSchoolStep = async () => {
    const alreadyMember = (affiliations.data ?? []).some((item) => item.status === 'active');
    if (!schoolId || alreadyMember) {
      goTo(stepIndex + 1, 'forward');
      return;
    }
    setSaving(true);
    setErrorText(null);
    try {
      await joinSchool.mutateAsync(
        normalizeSchoolAffiliationInput(schoolId, {
          role: schoolRole,
          roleLabel: '',
          visibility: 'profile',
        }),
      );
      goTo(stepIndex + 1, 'forward');
    } catch {
      setErrorText(t("L'école n'a pas pu être rejointe — tu pourras réessayer depuis ton profil."));
    } finally {
      setSaving(false);
    }
  };

  const enableNotifications = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      const outcome = await enableNotificationsDuringOnboarding(
        userId,
        i18n.resolvedLanguage ?? i18n.language ?? 'fr',
      );
      setNotificationOutcome(outcome);
      if (outcome === 'granted') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        goTo(stepIndex + 1, 'forward');
      }
    } catch {
      setErrorText(t('Impossible de lire les réglages de notifications.'));
    } finally {
      setSaving(false);
    }
  };

  const continueFlow = () => {
    if (issue) {
      setNameTouched(true);
      setErrorText(t(onboardingStepIssueMessage(issue)));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    switch (step) {
      case 'school':
        void leaveSchoolStep();
        return;
      case 'notifications':
        if (notificationOutcome === null) void enableNotifications();
        else goTo(stepIndex + 1, 'forward');
        return;
      case 'plan':
        void finish();
        return;
      default:
        goTo(stepIndex + 1, 'forward');
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

  const copy = stepCopy[step];
  const nameError =
    step === 'identity' && nameTouched && issue === 'name_too_short'
      ? t(onboardingStepIssueMessage('name_too_short'))
      : null;
  const footerLabel =
    step === 'plan'
      ? t('Continuer gratuitement')
      : step === 'notifications' && notificationOutcome === null
        ? t('Activer les notifications')
        : t('Continuer');
  const footerIcon =
    step === 'plan'
      ? 'flash'
      : step === 'notifications' && notificationOutcome === null
        ? 'notifications'
        : 'arrow-forward';

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
        <OnboardingProgress count={stepCount} step={stepIndex} />

        {loading ? (
          <LoadingState />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <OnboardingStepTransition direction={direction} stepKey={step}>
              <StepFrame icon={copy.icon} subtitle={t(copy.subtitle)} title={t(copy.title)}>
                {step === 'language' ? (
                  <OnboardingLanguageList
                    onSelect={chooseLanguage}
                    selectedLocale={i18n.resolvedLanguage}
                  />
                ) : null}
                {step === 'concepts' ? <OnboardingConceptCards /> : null}
                {step === 'place' ? (
                  <OnboardingPlaceCard
                    onChange={(place) =>
                      patch({
                        city: place.city,
                        country: place.countryCode,
                        postalCode: place.postalCode,
                      })
                    }
                    onPressCountry={() => setCountryModal(true)}
                    place={{
                      city: draft.city,
                      countryCode: draft.country,
                      postalCode: draft.postalCode,
                    }}
                  />
                ) : null}
                {step === 'identity' ? (
                  <IdentityStep
                    draft={draft}
                    error={nameError}
                    onBlurName={() => setNameTouched(true)}
                    onPickPhoto={() => void pickPhoto()}
                    patch={patch}
                    uploading={uploading}
                  />
                ) : null}
                {step === 'instruments' ? <InstrumentsStep draft={draft} patch={patch} /> : null}
                {step === 'styles' ? <StylesStep draft={draft} patch={patch} /> : null}
                {step === 'school' ? (
                  <SchoolStep
                    affiliations={affiliations.data ?? []}
                    error={schools.isError || affiliations.isError}
                    loading={schools.isLoading || affiliations.isLoading}
                    onRetry={() => {
                      void schools.refetch();
                      void affiliations.refetch();
                    }}
                    onSelectRole={setSchoolRole}
                    onSelectSchool={setSchoolId}
                    role={schoolRole}
                    schools={schools.data?.pages.flatMap((page) => page.items) ?? []}
                    selectedSchoolId={schoolId}
                  />
                ) : null}
                {step === 'notifications' ? (
                  <NotificationsStep
                    onSkip={() => goTo(stepIndex + 1, 'forward')}
                    outcome={notificationOutcome}
                  />
                ) : null}
                {step === 'plan' ? <PlanStep /> : null}
              </StepFrame>
            </OnboardingStepTransition>
          </ScrollView>
        )}

        <OnboardingError text={errorText} />

        {!loading ? (
          <OnboardingFooter {...(stepIndex > 0 ? { onBack: goBack } : {})}>
            <DispoButton
              disabled={saving || uploading}
              icon={footerIcon}
              loading={saving}
              onPress={continueFlow}
              variant={step === 'plan' ? 'ghost' : 'primary'}
            >
              {footerLabel}
            </DispoButton>
          </OnboardingFooter>
        ) : null}

        <CountryPickerModal
          onClose={() => setCountryModal(false)}
          onSelect={(country) => {
            patch({ country: country.code });
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
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centered: { textAlign: 'center' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.md },
});
