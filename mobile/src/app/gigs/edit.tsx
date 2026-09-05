import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GigForm } from '@/features/gigs/gig-form';
import { useGigForEdit, useGigFormDefaults, useUpdateGig } from '@/features/gigs/gig-queries';
import { parseGroupEventVenueLabel } from '@/features/groups/group-model';
import { spacing } from '@/theme/tokens';

export default function EditGigScreen() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();
  const gig = useGigForEdit(id);
  const defaults = useGigFormDefaults();
  const update = useUpdateGig();
  if (gig.isLoading || defaults.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement du SOS…')} />
      </Screen>
    );
  if (
    !gig.data ||
    gig.error ||
    !defaults.data ||
    defaults.error ||
    gig.data.hostId !== session?.user.id
  ) {
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Ce SOS ne peut pas être modifié.')}
          onRetry={() => {
            void gig.refetch();
            void defaults.refetch();
          }}
        />
      </Screen>
    );
  }
  const item = gig.data;
  const place = parseGroupEventVenueLabel(
    item.place,
    item.location.countryCode ?? defaults.data.countryCode,
  );
  const linked = Boolean(item.eventId);
  return (
    <Screen nativeHeader>
      <Stack.Screen options={{ title: t('Modifier le SOS') }} />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {linked ? (
          <>
            <AppText>{t('La date et le lieu de ce SOS suivent l’événement du groupe.')}</AppText>
            <DispoButton
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/groups/[id]/events/edit',
                  params: { id: item.groupId, eventId: item.eventId },
                } as never)
              }
            >
              {t('Modifier la session')}
            </DispoButton>
          </>
        ) : null}
        <GigForm
          key={item.id}
          defaults={{
            ...defaults.data,
            city: item.location.city ?? place.city ?? '',
            postalCode: item.location.postalCode ?? place.postalCode ?? '',
            countryCode: item.location.countryCode ?? place.countryCode,
            isProfessional:
              defaults.data.isProfessional || item.fee !== null || Boolean(item.paymentMethod),
          }}
          eventId={item.eventId}
          groupId={item.groupId}
          hostId={item.hostId}
          targetId={item.targetId}
          lockEventLocation={linked}
          mode={item.targetId ? 'direct' : 'public'}
          instrumentOptions={item.wantedInstruments}
          initial={{
            date: item.date,
            description: item.description ?? '',
            fee: item.fee,
            genre: item.genre,
            paymentMethod: item.paymentMethod,
            publicPlace: item.place,
            title: item.title,
            wantedInstruments: item.wantedInstruments,
            wantedLevels: item.wantedLevels,
            wantedSchoolIds: item.wantedSchoolIds ?? [],
            exactAddress: item.location.exactAddress ?? '',
            latitude: item.location.latitude,
            longitude: item.location.longitude,
          }}
          loading={update.isPending}
          submitLabel={t('Enregistrer')}
          errorMessage={
            update.error
              ? t(
                  update.error.message === 'accepted_instrument_cannot_be_removed'
                    ? 'Un instrument déjà pourvu ne peut pas être retiré.'
                    : 'Le SOS n’a pas pu être enregistré.',
                )
              : ''
          }
          onSubmit={(values) =>
            update.mutate(
              {
                gigId: item.id,
                values,
                clearExactAddress:
                  item.location.state === 'available' && !values.exactAddress.trim(),
              },
              { onSuccess: () => router.back() },
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
});
