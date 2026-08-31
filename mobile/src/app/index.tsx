import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { canCompleteOnboarding } from '@/features/onboarding/onboarding-model';
import { fetchOnboardingDraft } from '@/features/onboarding/onboarding-service';
import { normalizeMarketingVersion } from '@/features/settings/settings-model';
import { shouldPresentWhatsNew } from '@/features/settings/whats-new-storage';

export default function IndexRoute() {
  const { t } = useTranslation();
  const { isLoading, isPasswordRecovery, session } = useAuth();
  const profile = useQuery({
    enabled: Boolean(session?.user.id),
    queryFn: () => fetchOnboardingDraft(session?.user.id ?? ''),
    queryKey: ['onboarding', 'status', session?.user.id],
    retry: 2,
  });
  const profileComplete = Boolean(profile.data && canCompleteOnboarding(profile.data));
  const version = normalizeMarketingVersion(Constants.expoConfig?.version ?? '2.4');
  const whatsNew = useQuery({
    enabled: Boolean(session && profileComplete),
    queryFn: () => shouldPresentWhatsNew(version),
    queryKey: ['whats-new', session?.user.id, version],
    staleTime: Infinity,
  });
  if (
    isLoading ||
    (session && profile.isLoading) ||
    (session && profileComplete && whatsNew.isLoading)
  ) {
    return (
      <Screen>
        <LoadingState label={t('Restauration de la session…')} />
      </Screen>
    );
  }
  if (isPasswordRecovery) return <Redirect href={'/(auth)/update-password' as never} />;
  if (session && profile.isError) {
    return (
      <Screen>
        <ErrorState
          message={t('Ton profil ne peut pas être vérifié pour le moment.')}
          onRetry={() => void profile.refetch()}
        />
      </Screen>
    );
  }
  if (session && profile.data && !profileComplete) {
    return <Redirect href={'/onboarding' as never} />;
  }
  if (session && whatsNew.data) return <Redirect href={'/whats-new' as never} />;
  return <Redirect href={session ? '/(tabs)' : '/(auth)/sign-in'} />;
}
