import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  availableDayKey,
  dateFromLocalTime,
  defaultAvailabilityTimeSlot,
  hasInvalidAvailabilityTimeSlots,
  isValidAvailabilityTimeSlot,
  localTimeValue,
  normalizeAvailableDates,
  normalizeAvailabilityTimeSlots,
  profileAvailabilitySignature,
  removeAvailableDay,
  toggleAvailableDate,
  type AvailabilityTimeSlot,
  type ProfileAvailability,
} from './profile-availability-model';
import { fetchProfileAvailability, saveProfileAvailability } from './profile-edit-repository';
import { profileKeys } from './profile-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

function AvailabilityTimeField({
  day,
  label,
  onChange,
  value,
}: {
  day: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const { dark, palette } = useDispoTheme();
  const [open, setOpen] = useState(false);
  const date = dateFromLocalTime(day, value);
  const picker = (
    <DateTimePicker
      accentColor={palette.electric}
      display={Platform.OS === 'ios' ? 'compact' : 'default'}
      mode="time"
      onDismiss={() => setOpen(false)}
      onValueChange={(_event, selected) => {
        if (Platform.OS === 'android') setOpen(false);
        onChange(localTimeValue(selected));
      }}
      textColor={palette.text}
      themeVariant={dark ? 'dark' : 'light'}
      value={date}
    />
  );

  if (Platform.OS === 'ios') {
    return (
      <View
        style={[styles.timeField, { backgroundColor: palette.inset, borderColor: palette.border }]}
      >
        <AppText color={palette.muted} variant="caption2">
          {label}
        </AppText>
        {picker}
      </View>
    );
  }

  return (
    <View style={styles.androidTimeFieldWrap}>
      <Pressable
        accessibilityLabel={`${label}: ${value}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.timeField,
          { backgroundColor: palette.inset, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <AppText color={palette.muted} variant="caption2">
          {label}
        </AppText>
        <AppText variant="subheadline">{value}</AppText>
      </Pressable>
      {open ? picker : null}
    </View>
  );
}

export function ProfileAvailabilityScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { dark, palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: () => fetchProfileAvailability(userId),
    queryKey: ['profile', 'availability', userId],
  });
  const [draft, setDraft] = useState<ProfileAvailability | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(Platform.OS === 'ios');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const saved = query.data ?? { dates: [], timeSlots: {} };
  const availability = draft ?? saved;
  const dates = availability.dates;
  const invalidSlots = hasInvalidAvailabilityTimeSlots(availability);
  const hasUnsavedChanges =
    draft !== null && profileAvailabilitySignature(draft) !== profileAvailabilitySignature(saved);

  const updateDay = (date: Date) => {
    const day = availableDayKey(date);
    const nextDates = toggleAvailableDate(dates, day);
    setCalendarDate(date);
    setDraft({
      dates: nextDates,
      timeSlots: normalizeAvailabilityTimeSlots(availability.timeSlots, nextDates),
    });
    setErrorText(null);
  };

  const updateSlots = (day: string, slots: AvailabilityTimeSlot[]) => {
    const otherDays = { ...availability.timeSlots };
    delete otherDays[day];
    setDraft({
      dates,
      timeSlots: slots.length ? { ...otherDays, [day]: slots } : otherDays,
    });
    setErrorText(null);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      if (invalidSlots) {
        setErrorText(t("L'heure de fin doit suivre l'heure de début."));
        return;
      }
      const normalized = {
        dates: normalizeAvailableDates(dates),
        timeSlots: normalizeAvailabilityTimeSlots(availability.timeSlots, dates),
      };
      await saveProfileAvailability(userId, normalized);
      queryClient.setQueryData(['profile', 'availability', userId], normalized);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) }),
        queryClient.invalidateQueries({ queryKey: profileKeys.discovery(userId) }),
        queryClient.invalidateQueries({ queryKey: ['profile', 'edit', userId] }),
      ]);
      router.back();
    } catch {
      setErrorText(t("Tes disponibilités n'ont pas pu être enregistrées — vérifie le réseau."));
    } finally {
      setSaving(false);
    }
  };

  const nativeHeader = (
    <Stack.Screen
      options={{
        headerLeft: () => <NativeHeaderButton label={t('Fermer')} onPress={() => router.back()} />,
        headerRight: () => (
          <NativeHeaderButton
            disabled={!hasUnsavedChanges || invalidSlots || saving}
            label={t('Enregistrer')}
            onPress={() => void save()}
          />
        ),
        title: t('Mes disponibilités'),
      }}
    />
  );

  if (query.isLoading) {
    return (
      <Screen nativeHeader>
        {nativeHeader}
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen nativeHeader>
        {nativeHeader}
        <ErrorState message={t('Chargement impossible.')} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen nativeHeader>
      {nativeHeader}
      <ScrollView contentContainerStyle={styles.content}>
        {hasUnsavedChanges ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.unsavedBanner,
              { backgroundColor: `${palette.bronze}16`, borderColor: `${palette.bronze}55` },
            ]}
          >
            <Ionicons color={palette.bronze} name="alert-circle-outline" size={19} />
            <AppText color={palette.bronze} style={styles.flex} variant="caption">
              {t('Enregistrer les modifications')}
            </AppText>
          </View>
        ) : null}
        <Card style={styles.card}>
          <View style={styles.headingRow}>
            <View style={[styles.icon, { backgroundColor: `${palette.jam}18` }]}>
              <Ionicons color={palette.jam} name="flash" size={19} />
            </View>
            <View style={styles.flex}>
              <SectionHeader title={t('Dates de disponibilité')} />
              <AppText color={palette.muted} variant="caption">
                {t(
                  'Choisis les jours où tu peux dépanner. Pour en retirer un, touche-le dans la liste.',
                )}
              </AppText>
            </View>
          </View>

          {Platform.OS === 'ios' || calendarVisible ? (
            <DateTimePicker
              accentColor={palette.electric}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              mode="date"
              onDismiss={() => {
                if (Platform.OS === 'android') setCalendarVisible(false);
              }}
              onValueChange={(_event, date) => {
                if (Platform.OS === 'android') setCalendarVisible(false);
                updateDay(date);
              }}
              textColor={palette.text}
              themeVariant={dark ? 'dark' : 'light'}
              value={calendarDate}
            />
          ) : (
            <DispoButton
              icon="calendar-outline"
              onPress={() => setCalendarVisible(true)}
              variant="secondary"
            >
              {t('Ajouter ou retirer une date')}
            </DispoButton>
          )}
        </Card>

        <View style={styles.sectionHeading}>
          <View style={styles.flex}>
            <SectionHeader
              subtitle={
                dates.length === 1
                  ? t('1 date cochée')
                  : t('{{count}} dates cochées', { count: dates.length })
              }
              title={t('Jours sélectionnés')}
            />
          </View>
          {dates.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  t('Retirer toutes les dates ?'),
                  t(
                    'Tu apparaîtras comme indisponible tant que tu ne coches pas de nouvelle date.',
                  ),
                  [
                    { style: 'cancel', text: t('Annuler') },
                    {
                      onPress: () => setDraft({ dates: [], timeSlots: {} }),
                      style: 'destructive',
                      text: t('Tout retirer'),
                    },
                  ],
                )
              }
              style={styles.clearButton}
            >
              <AppText color={palette.signal} variant="caption">
                {t('Tout retirer')}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.dateCards}>
          {dates.length ? (
            dates.map((date) => {
              const slots = availability.timeSlots[date] ?? [];
              return (
                <Card key={date} style={styles.dateCard}>
                  <View style={styles.dateRow}>
                    <View style={[styles.dateIcon, { backgroundColor: `${palette.jam}18` }]}>
                      <Ionicons color={palette.jam} name="checkmark" size={17} />
                    </View>
                    <AppText style={styles.flex} variant="subheadline">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'full',
                      }).format(new Date(`${date}T12:00:00`))}
                    </AppText>
                    <Pressable
                      accessibilityHint={t('Retire cette date de tes disponibilités')}
                      accessibilityLabel={t('Supprimer')}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setDraft(removeAvailableDay(availability, date))}
                      style={({ pressed }) => [styles.removeDateButton, pressed && styles.pressed]}
                    >
                      <Ionicons color={palette.muted} name="close-circle" size={22} />
                    </Pressable>
                  </View>

                  <View style={[styles.slotSection, { borderTopColor: palette.border }]}>
                    <View style={styles.slotHeading}>
                      <View style={styles.flex}>
                        <AppText variant="caption">{t('Créneaux horaires')}</AppText>
                        <AppText color={palette.muted} variant="caption2">
                          {t('Facultatif — sans créneau, tu es disponible toute la journée.')}
                        </AppText>
                      </View>
                      <Pressable
                        accessibilityLabel={t('Ajouter un créneau')}
                        accessibilityRole="button"
                        onPress={() =>
                          updateSlots(date, [...slots, defaultAvailabilityTimeSlot(slots)])
                        }
                        style={({ pressed }) => [styles.addSlotButton, pressed && styles.pressed]}
                      >
                        <Ionicons color={palette.electric} name="add-circle" size={18} />
                        <AppText color={palette.electric} variant="caption">
                          {t('Ajouter')}
                        </AppText>
                      </Pressable>
                    </View>

                    {slots.map((slot, index) => {
                      const valid = isValidAvailabilityTimeSlot(slot);
                      const updateSlot = (part: 'start' | 'end', value: string) =>
                        updateSlots(
                          date,
                          slots.map((candidate, candidateIndex) =>
                            candidateIndex === index ? { ...candidate, [part]: value } : candidate,
                          ),
                        );
                      return (
                        <View
                          key={`${date}-${index}`}
                          style={[
                            styles.slotRow,
                            !valid && {
                              backgroundColor: `${palette.signal}10`,
                              borderColor: `${palette.signal}55`,
                            },
                          ]}
                        >
                          <AvailabilityTimeField
                            day={date}
                            label={t('Début')}
                            onChange={(value) => updateSlot('start', value)}
                            value={slot.start}
                          />
                          <AvailabilityTimeField
                            day={date}
                            label={t('Fin')}
                            onChange={(value) => updateSlot('end', value)}
                            value={slot.end}
                          />
                          <Pressable
                            accessibilityLabel={t('Supprimer ce créneau')}
                            accessibilityRole="button"
                            onPress={() =>
                              updateSlots(
                                date,
                                slots.filter(
                                  (_candidate, candidateIndex) => candidateIndex !== index,
                                ),
                              )
                            }
                            style={({ pressed }) => [
                              styles.removeSlotButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons color={palette.muted} name="trash-outline" size={18} />
                          </Pressable>
                          {!valid ? (
                            <AppText
                              color={palette.signal}
                              style={styles.slotError}
                              variant="caption2"
                            >
                              {t("L'heure de fin doit suivre l'heure de début.")}
                            </AppText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </Card>
              );
            })
          ) : (
            <Card>
              <View style={styles.empty}>
                <Ionicons color={palette.muted} name="moon-outline" size={25} />
                <AppText color={palette.muted} style={styles.emptyText} variant="caption">
                  {t('Aucune date cochée — tu apparais comme indisponible.')}
                </AppText>
              </View>
            </Card>
          )}
        </View>

        {errorText ? (
          <AppText color={palette.signal} style={styles.error} variant="caption">
            {errorText}
          </AppText>
        ) : null}
        <DispoButton
          disabled={!hasUnsavedChanges || invalidSlots}
          loading={saving}
          onPress={() => void save()}
        >
          {t('Enregistrer mes disponibilités')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addSlotButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  androidTimeFieldWrap: { flex: 1 },
  card: { gap: spacing.sm },
  clearButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.tight,
  },
  content: { gap: spacing.md, padding: spacing.gutter, paddingBottom: spacing.xxl },
  dateCard: { gap: 0, padding: 0 },
  dateCards: { gap: spacing.sm },
  dateIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  empty: { alignItems: 'center', gap: spacing.xs, padding: spacing.lg },
  emptyText: { textAlign: 'center' },
  error: { textAlign: 'center' },
  flex: { flex: 1 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  icon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: { opacity: 0.76 },
  removeDateButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  removeSlotButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 40,
  },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  slotError: { flexBasis: '100%', textAlign: 'center' },
  slotHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  slotRow: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  slotSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    padding: spacing.md,
  },
  timeField: {
    borderRadius: radii.button,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 54,
    minWidth: 92,
    paddingHorizontal: spacing.xs,
  },
  unsavedBanner: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
});
