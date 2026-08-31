import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GigForm, type GigFormInitial } from '@/features/gigs/gig-form';
import type { GigFormDefaults } from '@/features/gigs/gig-model';
import { useCreateGig, useGigFormDefaults } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const fallbackDefaults: GigFormDefaults = {
  city: '',
  countryCode: 'CH',
  genres: ['Jazz'],
  isProfessional: false,
  postalCode: '',
};

export default function CreateGigScreen() {
  const { date, eventId, groupId, instruments, place, title } = useLocalSearchParams<{
    date?: string;
    eventId?: string;
    groupId?: string;
    instruments?: string;
    place?: string;
    title?: string;
  }>();
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const defaults = useGigFormDefaults();
  const create = useCreateGig();
  const { t } = useTranslation();
  const initial: GigFormInitial = {
    ...(date ? { date } : {}),
    ...(place ? { publicPlace: place } : {}),
    ...(title ? { title } : {}),
    wantedInstruments: instruments?.split('|').filter(Boolean) ?? [],
  };

  if (defaults.isLoading) {
    return (
      <Screen>
        <LoadingState label={t('Préparation du formulaire…')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          icon="flash"
          subtitle={t('L’adresse exacte reste privée jusqu’à l’acceptation.')}
          title={t('Publier un SOS')}
        />
        {defaults.isError ? (
          <AppText color={palette.muted} variant="caption">
            {t(
              'Tes coordonnées par défaut n’ont pas pu être chargées. Tu peux les saisir ci-dessous.',
            )}
          </AppText>
        ) : null}
        <GigForm
          defaults={defaults.data ?? fallbackDefaults}
          eventId={eventId || null}
          groupId={groupId || null}
          hostId={session?.user.id ?? ''}
          initial={initial}
          loading={create.isPending}
          mode="public"
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (id) => router.replace(`/gigs/matches?id=${id}` as never),
            })
          }
          submitLabel={t('Publier le SOS')}
          {...(create.error ? { errorMessage: t("L'annonce n'a pas pu être publiée.") } : {})}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
});
