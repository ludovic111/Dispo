import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { GigForm, type GigFormInitial } from '@/features/gigs/gig-form';
import type { GigFormDefaults } from '@/features/gigs/gig-model';
import { useCreateGig, useGig, useGigFormDefaults } from '@/features/gigs/gig-queries';
import { useProfile } from '@/features/profiles/profile-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const fallbackDefaults: GigFormDefaults = {
  city: '',
  countryCode: 'CH',
  genres: ['Jazz'],
  isProfessional: false,
  postalCode: '',
};

function todayKey(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function DirectGigRequestScreen() {
  const { gigId = '', profileId = '' } = useLocalSearchParams<{
    gigId?: string;
    profileId?: string;
  }>();
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const userId = session?.user.id ?? '';
  const profile = useProfile(profileId, userId);
  const sourceGig = useGig(gigId);
  const defaults = useGigFormDefaults();
  const create = useCreateGig();
  const { t } = useTranslation();
  const back = (
    <HeaderAction icon="chevron-back" label={t('Retour')} onPress={() => router.back()} />
  );

  const waiting =
    profile.isLoading || defaults.isLoading || (Boolean(gigId) && sourceGig.isLoading);
  if (waiting) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Demande de dépannage')} />
        <LoadingState label={t('Préparation de la demande…')} />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Demande de dépannage')} />
        <ErrorState message={profile.error.message} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }
  if (!profile.data) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Demande de dépannage')} />
        <ErrorState message={t('Profil introuvable.')} />
      </Screen>
    );
  }

  const source = sourceGig.data;
  const matchingInstruments = source
    ? profile.data.instruments.filter((instrument) => source.wantedInstruments.includes(instrument))
    : profile.data.instruments;
  const instrumentOptions = matchingInstruments.length
    ? matchingInstruments
    : profile.data.instruments;
  const initial: GigFormInitial = {
    ...(source?.date ? { date: source.date } : {}),
    ...(source?.fee !== undefined ? { fee: source.fee } : {}),
    ...(source?.genre ? { genre: source.genre } : {}),
    ...(source?.paymentMethod !== undefined ? { paymentMethod: source.paymentMethod } : {}),
    ...(source?.place ? { publicPlace: source.place } : {}),
    title: instrumentOptions[0] ? `${t('Dépannage')} — ${t(instrumentOptions[0])}` : t('Dépannage'),
    wantedInstruments: instrumentOptions[0] ? [instrumentOptions[0]] : [],
  };
  const availableDates = profile.data.availableDates
    .filter((value) => value.slice(0, 10) >= todayKey())
    .sort();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          leadingAction={back}
          subtitle={t('La personne répond oui ou non directement dans Dispo.')}
          title={t('Demande de dépannage')}
        />
        {sourceGig.isError ? (
          <AppText color={palette.muted} variant="caption">
            {t('Le SOS d’origine n’a pas pu être repris automatiquement.')}
          </AppText>
        ) : null}
        <GigForm
          availableDates={availableDates}
          defaults={defaults.data ?? fallbackDefaults}
          hostId={userId}
          initial={initial}
          instrumentOptions={instrumentOptions}
          loading={create.isPending}
          mode="direct"
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (id) => router.replace(`/gigs/${id}`),
            })
          }
          submitLabel={t('Envoyer la demande')}
          targetId={profile.data.id}
          targetName={profile.data.name}
          {...(create.error ? { errorMessage: t("La demande n'a pas pu être envoyée.") } : {})}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
});
