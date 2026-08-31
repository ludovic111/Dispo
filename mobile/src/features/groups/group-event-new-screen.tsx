import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { recurrenceDates, type GroupEventKind, type GroupRecurrence } from './group-model';
import { useCreateGroupEvents, useGroup } from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { PostalPlaceField, type ResolvedPostalPlace } from '@/features/location';
import { canUsePremiumCapability } from '@/features/premium/premium-model';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

const eventKinds: { icon: 'flame' | 'mic' | 'repeat'; label: GroupEventKind }[] = [
  { icon: 'mic', label: 'Concert' },
  { icon: 'repeat', label: 'Répétition' },
  { icon: 'flame', label: 'Jam' },
];
const recurrences: GroupRecurrence[] = [
  'Ponctuel',
  'Chaque semaine',
  'Toutes les 2 semaines',
  'Chaque mois',
];
const reminderOptions = [0, 1, 2, 7, 14];
const eventCreationFloor = new Date();
const defaultEventDate = new Date(eventCreationFloor.getTime() + 86_400_000);

function reminderLabel(days: number, t: TFunction) {
  if (days === 0) return t('Le jour même');
  if (days === 1) return t('La veille');
  if (days === 7) return t('Une semaine avant');
  if (days === 14) return t('Deux semaines avant');
  return formatSwiftPlaceholders(t('%lld jours avant'), days);
}

export function GroupEventNewScreen({ groupId }: { groupId: string }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { i18n, t } = useTranslation();
  const { palette } = useDispoTheme();
  const group = useGroup(groupId);
  const create = useCreateGroupEvents();
  const [kind, setKind] = useState<GroupEventKind>('Répétition');
  const [title, setTitle] = useState(() => t('Répétition'));
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [countryCode, setCountryCode] = useState('CH');
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedPostalPlace | null>(null);
  const [exactAddress, setExactAddress] = useState('');
  const [date, setDate] = useState(defaultEventDate);
  const [recurrence, setRecurrence] = useState<GroupRecurrence>('Ponctuel');
  const [occurrenceCount, setOccurrenceCount] = useState(1);
  const [reminderLeadDays, setReminderLeadDays] = useState(2);
  const canRepeat = canUsePremiumCapability('recurringEvents');
  const canConfigureReminder = canUsePremiumCapability('configurableReminders');
  if (group.isLoading)
    return (
      <Screen>
        <LoadingState label={t('Chargement du groupe…')} />
      </Screen>
    );
  if (group.error)
    return (
      <Screen>
        <ErrorState message={t('Ce groupe n’a pas pu être chargé.')} />
      </Screen>
    );
  if (!group.data || group.data.leaderId !== userId)
    return (
      <Screen>
        <ErrorState message={t('Seul le leader peut créer une date.')} />
      </Screen>
    );
  const maxCount =
    recurrence === 'Chaque semaine'
      ? 52
      : recurrence === 'Toutes les 2 semaines'
        ? 26
        : recurrence === 'Chaque mois'
          ? 12
          : 1;
  const count = recurrence === 'Ponctuel' ? 1 : Math.min(Math.max(occurrenceCount, 2), maxCount);
  const previews = recurrenceDates(date.toISOString(), recurrence, count);
  const valid =
    title.trim().length > 0 &&
    venue.trim().length > 0 &&
    city.trim().length > 0 &&
    postalCode.trim().length > 0 &&
    date.getTime() > eventCreationFloor.getTime();
  const submit = () => {
    create.mutate(
      {
        draft: {
          city,
          countryCode,
          date: date.toISOString(),
          exactAddress,
          kind,
          latitude: resolvedPlace?.latitude ?? null,
          longitude: resolvedPlace?.longitude ?? null,
          occurrenceCount: count,
          postalCode,
          recurrence,
          reminderLeadDays: canConfigureReminder ? reminderLeadDays : 2,
          title,
          venue,
        },
        groupId,
      },
      { onSuccess: () => router.back() },
    );
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader icon="calendar" subtitle={group.data.name} title={t('Créer un événement')} />
        <Card style={styles.card}>
          <AppText variant="title">{t('Type de date')}</AppText>
          <View style={styles.wrap}>
            {eventKinds.map((item) => (
              <ChoiceChip
                icon={item.icon}
                key={item.label}
                label={t(item.label)}
                onPress={() => {
                  setKind(item.label);
                  if (eventKinds.some((option) => title === t(option.label)))
                    setTitle(t(item.label));
                }}
                selected={kind === item.label}
              />
            ))}
          </View>
          <FormField
            label={t('Titre')}
            onChangeText={setTitle}
            placeholder={t('Répétition générale')}
            value={title}
          />
        </Card>
        <Card style={styles.card}>
          <AppText variant="title">{t('Date et heure')}</AppText>
          <View style={[styles.datePicker, { backgroundColor: palette.inset }]}>
            <DateTimePicker
              minimumDate={new Date()}
              mode="date"
              onChange={(_event, value) => value && setDate(value)}
              value={date}
            />
            <DateTimePicker
              mode="time"
              onChange={(_event, value) => value && setDate(value)}
              value={date}
            />
          </View>
        </Card>
        <Card style={styles.card}>
          <AppText variant="title">{t('Lieu')}</AppText>
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
            onChangeText={setExactAddress}
            placeholder={t('Rue, numéro, entrée…')}
            value={exactAddress}
          />
          <View style={styles.privateNote}>
            <Ionicons color={palette.jam} name="shield-checkmark" size={16} />
            <AppText color={palette.jam} style={styles.flex} variant="caption">
              {t('L’adresse exacte reste cachée aux membres qui n’ont pas confirmé leur présence.')}
            </AppText>
          </View>
        </Card>
        <Card style={styles.card}>
          <AppText variant="title">{t('Rythme')}</AppText>
          <View style={styles.wrap}>
            {recurrences.map((option) => (
              <ChoiceChip
                key={option}
                label={t(option)}
                onPress={() => {
                  setRecurrence(option);
                  setOccurrenceCount(option === 'Ponctuel' ? 1 : 4);
                }}
                selected={recurrence === option}
              />
            ))}
          </View>
          {canRepeat && recurrence !== 'Ponctuel' ? (
            <View style={styles.counter}>
              <Pressable
                onPress={() => setOccurrenceCount(Math.max(2, count - 1))}
                style={[styles.counterButton, { borderColor: palette.border }]}
              >
                <Ionicons color={palette.text} name="remove" size={18} />
              </Pressable>
              <AppText style={styles.counterText}>
                {formatSwiftPlaceholders(t('%lld dates'), count)}
              </AppText>
              <Pressable
                onPress={() => setOccurrenceCount(Math.min(maxCount, count + 1))}
                style={[styles.counterButton, { borderColor: palette.border }]}
              >
                <Ionicons color={palette.text} name="add" size={18} />
              </Pressable>
            </View>
          ) : null}
          {previews.slice(0, 5).map((value) => (
            <AppText color={palette.muted} key={value} variant="caption">
              {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
                dateStyle: 'full',
                timeStyle: 'short',
              }).format(new Date(value))}
            </AppText>
          ))}
          {previews.length > 5 ? (
            <AppText color={palette.muted} variant="caption">
              {formatSwiftPlaceholders(t('+ %lld autres'), previews.length - 5)}
            </AppText>
          ) : null}
        </Card>
        <Card style={styles.card}>
          <AppText variant="title">{t('Rappel')}</AppText>
          {canConfigureReminder ? (
            <View style={styles.wrap}>
              {reminderOptions.map((days) => (
                <ChoiceChip
                  key={days}
                  label={reminderLabel(days, t)}
                  onPress={() => setReminderLeadDays(days)}
                  selected={reminderLeadDays === days}
                />
              ))}
            </View>
          ) : (
            <View style={styles.privateNote}>
              <Ionicons color={palette.bronze} name="notifications" size={16} />
              <AppText color={palette.muted} style={styles.flex} variant="caption">
                {t(
                  'Le rappel gratuit part 2 jours avant. Premium permet de choisir le moment exact.',
                )}
              </AppText>
            </View>
          )}
        </Card>
        {create.error ? (
          <AppText color={palette.error} style={styles.center} variant="caption">
            {t('La date n’a pas pu être créée.')}
          </AppText>
        ) : null}
        <DispoButton disabled={!valid} icon="calendar" loading={create.isPending} onPress={submit}>
          {count > 1 ? t('Créer {{count}} dates', { count }) : t('Créer la date')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  center: { textAlign: 'center' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  counter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  counterButton: {
    alignItems: 'center',
    borderRadius: 19,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  counterText: { fontWeight: '800', minWidth: 75, textAlign: 'center' },
  datePicker: { borderRadius: radii.button, gap: spacing.xs, padding: spacing.xs },
  flex: { flex: 1 },
  privateNote: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
