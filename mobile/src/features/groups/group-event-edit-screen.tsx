import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { parseGroupEventVenueLabel, type GroupEvent, type MusicGroup } from './group-model';
import { useGroup, useUpdateGroupEvent } from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { NativeDateTimeField } from '@/components/ui/native-date-time-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { PostalPlaceField, type ResolvedPostalPlace } from '@/features/location';
import { canUsePremiumCapability } from '@/features/premium/premium-model';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const reminderOptions = [0, 1, 2, 7, 14];

function EventEditForm({ event, group }: { event: GroupEvent; group: MusicGroup }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const update = useUpdateGroupEvent();
  const parsedPlace = parseGroupEventVenueLabel(
    event.publicLocationLabel || event.venue,
    event.countryCode ?? 'CH',
  );
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(new Date(event.date));
  const [venue, setVenue] = useState(parsedPlace.venue);
  const [city, setCity] = useState(event.city ?? parsedPlace.city);
  const [postalCode, setPostalCode] = useState(event.postalCode ?? parsedPlace.postalCode);
  const [countryCode, setCountryCode] = useState(event.countryCode ?? parsedPlace.countryCode);
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedPostalPlace | null>(null);
  const [exactAddress, setExactAddress] = useState(event.exactAddress ?? '');
  const [clearExactAddress, setClearExactAddress] = useState(false);
  const [reminderLeadDays, setReminderLeadDays] = useState(event.reminderLeadDays ?? 2);
  const [scope, setScope] = useState<'futureOccurrences' | 'thisDate'>('thisDate');
  const [editStartedAt] = useState(Date.now);
  const valid =
    title.trim().length > 0 &&
    venue.trim().length > 0 &&
    city.trim().length > 0 &&
    postalCode.trim().length > 0 &&
    !Number.isNaN(date.getTime());
  const dayChanges = date.toDateString() !== new Date(event.date).toDateString();
  const affectedCount = event.seriesId
    ? group.events.filter(
        (item) =>
          item.seriesId === event.seriesId &&
          (item.id === event.id || new Date(item.date).getTime() > editStartedAt),
      ).length
    : 1;
  const submit = () =>
    update.mutate(
      {
        date: date.toISOString(),
        city,
        clearExactAddress,
        countryCode,
        event,
        events: group.events,
        exactAddress,
        groupId: group.id,
        latitude: resolvedPlace?.latitude ?? event.latitude ?? null,
        leaderId: group.leaderId,
        longitude: resolvedPlace?.longitude ?? event.longitude ?? null,
        postalCode,
        reminderLeadDays: canUsePremiumCapability('configurableReminders') ? reminderLeadDays : 2,
        scope,
        title,
        venue,
      },
      { onSuccess: () => router.back() },
    );
  return (
    <Screen nativeHeader>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <FormField label={t('Titre')} onChangeText={setTitle} value={title} />
          <NativeDateTimeField
            dateLabel={t('Date')}
            timeLabel={t('Heure')}
            onChange={setDate}
            value={date}
          />
          {dayChanges ? (
            <View style={styles.note}>
              <Ionicons color={palette.signal} name="sync" size={16} />
              <AppText color={palette.signal} style={styles.flex} variant="caption">
                {t('Le jour change : les réponses de présence seront redemandées.')}
              </AppText>
            </View>
          ) : null}
        </Card>
        <Card style={styles.card}>
          <FormField
            label={t('Salle ou bar')}
            onChangeText={setVenue}
            placeholder={t('Le Groove')}
            value={venue}
          />
          <FormField
            autoCapitalize="characters"
            label={t('Pays')}
            maxLength={2}
            onChangeText={(value) => {
              setResolvedPlace(null);
              setCountryCode(value);
            }}
            value={countryCode}
          />
          <PostalPlaceField
            onChange={(place) => {
              setResolvedPlace(null);
              setCountryCode(place.countryCode);
              setPostalCode(place.postalCode);
              setCity(place.city);
            }}
            onResolved={setResolvedPlace}
            value={{ city, countryCode, postalCode }}
          />
          <FormField
            label={t('Adresse privée')}
            multiline
            onChangeText={(value) => {
              setExactAddress(value);
              if (value.trim()) setClearExactAddress(false);
            }}
            placeholder={t('Rue, numéro, entrée…')}
            value={exactAddress}
          />
          {event.privateLocationState === 'available' && !clearExactAddress ? (
            <Pressable
              onPress={() => {
                setExactAddress('');
                setClearExactAddress(true);
              }}
              style={styles.removeAddress}
            >
              <Ionicons color={palette.signal} name="trash-outline" size={15} />
              <AppText color={palette.signal} variant="caption">
                {t("Supprimer l'adresse privée")}
              </AppText>
            </Pressable>
          ) : null}
          {clearExactAddress ? (
            <View style={styles.note}>
              <Ionicons color={palette.signal} name="trash" size={16} />
              <AppText color={palette.signal} style={styles.flex} variant="caption">
                {t("L'adresse sera supprimée.")}
              </AppText>
              <Pressable
                onPress={() => {
                  setClearExactAddress(false);
                  setExactAddress(event.exactAddress ?? '');
                }}
              >
                <AppText color={palette.electric} variant="caption">
                  {t('Annuler la suppression')}
                </AppText>
              </Pressable>
            </View>
          ) : null}
          {event.privateLocationState === 'unknown' ? (
            <AppText color={palette.signal} variant="caption">
              {t(
                "L'adresse existante n'a pas pu être chargée. Elle sera conservée si tu ne la remplaces pas.",
              )}
            </AppText>
          ) : null}
          {event.privateLocationState === 'restricted' ? (
            <AppText color={palette.muted} variant="caption">
              {t(
                "L'adresse privée n'est pas accessible. Une saisie vide conservera la valeur serveur.",
              )}
            </AppText>
          ) : null}
          <View style={styles.note}>
            <Ionicons color={palette.jam} name="lock-closed" size={16} />
            <AppText color={palette.muted} style={styles.flex} variant="caption">
              {t(
                "L'adresse exacte reste invisible aux membres qui n'ont pas confirmé leur présence.",
              )}
            </AppText>
          </View>
          <AppText color={palette.muted} variant="caption2">
            {t("Effacer simplement le champ ne supprime rien : utilise l'action dédiée.")}
          </AppText>
        </Card>
        <Card style={styles.card}>
          <AppText variant="title">{t('Rappel')}</AppText>
          {canUsePremiumCapability('configurableReminders') ? (
            <View style={styles.wrap}>
              {reminderOptions.map((days) => (
                <ChoiceChip
                  key={days}
                  label={
                    days === 0
                      ? t('Le jour même')
                      : days === 1
                        ? t('La veille')
                        : formatSwiftPlaceholders(t('%lld jours avant'), days)
                  }
                  onPress={() => setReminderLeadDays(days)}
                  selected={reminderLeadDays === days}
                />
              ))}
            </View>
          ) : (
            <AppText color={palette.muted} variant="caption">
              {t('Le rappel gratuit reste fixé à 2 jours avant.')}
            </AppText>
          )}
        </Card>
        {event.seriesId ? (
          <Card style={styles.card}>
            <AppText variant="title">{t("Ça s'applique à")}</AppText>
            <View style={styles.wrap}>
              <ChoiceChip
                label={t('Cette date seulement')}
                onPress={() => setScope('thisDate')}
                selected={scope === 'thisDate'}
              />
              <ChoiceChip
                label={t('Toutes les dates à venir')}
                onPress={() => setScope('futureOccurrences')}
                selected={scope === 'futureOccurrences'}
              />
            </View>
            <AppText color={palette.muted} variant="caption">
              {scope === 'thisDate'
                ? t('Seule cette date bouge. Les autres répétitions gardent leur horaire.')
                : `${formatSwiftPlaceholders(t('%lld dates seront modifiées.'), Math.max(affectedCount, 1))} ${t("Les jours de la série restent inchangés ; le nouvel horaire, le titre et le lieu s'appliquent à toutes les dates à venir.")}`}
            </AppText>
          </Card>
        ) : null}
        {update.error ? (
          <AppText color={palette.error} style={styles.center} variant="caption">
            {t("La session n'a pas pu être modifiée.")}
          </AppText>
        ) : null}
        <DispoButton disabled={!valid} loading={update.isPending} onPress={submit}>
          {t('Enregistrer les modifications')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

export function GroupEventEditScreen({ eventId, groupId }: { eventId: string; groupId: string }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useGroup(groupId);
  if (query.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement de la session…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen nativeHeader>
        <ErrorState message={t("Cette session n'a pas pu être chargée.")} />
      </Screen>
    );
  const group = query.data;
  const event = group?.events.find((item) => item.id === eventId);
  if (!group || !event)
    return (
      <Screen nativeHeader>
        <ErrorState message={t("Cette session n'est plus accessible.")} />
      </Screen>
    );
  if (group.leaderId !== userId)
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Seul le leader peut modifier cette session.')} />
      </Screen>
    );
  return <EventEditForm event={event} group={group} />;
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  center: { textAlign: 'center' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  note: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  removeAddress: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
