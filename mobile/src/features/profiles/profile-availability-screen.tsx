import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { NativeDatePartField } from './native-date-part-field';
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
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { elevation, keyStyle, minimumTouchTarget, radii, spacing, tint } from '@/theme/tokens';

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

  const clearAll = () =>
    Alert.alert(
      t('Retirer toutes les dates ?'),
      t('Tu apparaîtras comme indisponible tant que tu ne coches pas de nouvelle date.'),
      [
        { style: 'cancel', text: t('Annuler') },
        {
          onPress: () => setDraft({ dates: [], timeSlots: {} }),
          style: 'destructive',
          text: t('Tout retirer'),
        },
      ],
    );

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
            style={[styles.unsavedBanner, { backgroundColor: tint(palette.bronze, 0.09) }]}
          >
            <Ionicons color={palette.bronze} name="alert-circle-outline" size={19} />
            <AppText color={palette.bronze} style={styles.flex} variant="caption">
              {t('Enregistrer les modifications')}
            </AppText>
          </View>
        ) : null}
        <Card style={styles.card}>
          <View style={styles.headingRow}>
            <View style={[styles.icon, { backgroundColor: tint(palette.jam, 0.09) }]}>
              <Ionicons color={palette.jam} name="flash" size={19} />
            </View>
            <View style={styles.flex}>
              <SectionHeader
                subtitle={t(
                  'Choisis les jours où tu peux dépanner. Pour en retirer un, touche-le dans la liste.',
                )}
                title={t('Dates de disponibilité')}
              />
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

        <SectionHeader
          {...(dates.length ? { action: { label: t('Tout retirer'), onPress: clearAll } } : {})}
          subtitle={
            dates.length === 1
              ? t('1 date cochée')
              : t('{{count}} dates cochées', { count: dates.length })
          }
          title={t('Jours sélectionnés')}
        />

        <View style={styles.dateCards}>
          {dates.length ? (
            dates.map((date) => {
              const slots = availability.timeSlots[date] ?? [];
              return (
                <Card key={date} padding={0}>
                  <View style={styles.dateRow}>
                    <View
                      style={[
                        styles.dateIcon,
                        keyStyle(palette.accent, palette.accentDeep),
                        elevation(1, palette),
                      ]}
                    >
                      <Ionicons color={palette.accentInk} name="checkmark" size={17} />
                    </View>
                    <AppText style={styles.flex} variant="subheadline" weight="semibold">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'full',
                      }).format(new Date(`${date}T12:00:00`))}
                    </AppText>
                    <IconButton
                      accessibilityLabel={t('Supprimer')}
                      icon="close-circle"
                      iconColor={palette.muted}
                      onPress={() => setDraft(removeAvailableDay(availability, date))}
                      variant="plain"
                    />
                  </View>

                  <View style={[styles.slotSection, { borderTopColor: palette.border }]}>
                    <View style={styles.slotHeading}>
                      <View style={styles.flex}>
                        <AppText color={palette.muted} variant="label">
                          {t('Créneaux horaires')}
                        </AppText>
                        <AppText color={palette.muted} variant="caption2">
                          {t('Facultatif — sans créneau, tu es disponible toute la journée.')}
                        </AppText>
                      </View>
                      <DispoButton
                        accessibilityLabel={t('Ajouter un créneau')}
                        icon="add-circle"
                        onPress={() =>
                          updateSlots(date, [...slots, defaultAvailabilityTimeSlot(slots)])
                        }
                        size="compact"
                        variant="ghost"
                      >
                        {t('Ajouter')}
                      </DispoButton>
                    </View>

                    {slots.map((slot, index) => {
                      const valid = isValidAvailabilityTimeSlot(slot);
                      const updateSlot = (part: 'start' | 'end', value: Date) =>
                        updateSlots(
                          date,
                          slots.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, [part]: localTimeValue(value) }
                              : candidate,
                          ),
                        );
                      return (
                        <View
                          key={`${date}-${index}`}
                          style={[
                            styles.slotRow,
                            !valid && { backgroundColor: tint(palette.signal, 0.06) },
                          ]}
                        >
                          <NativeDatePartField
                            label={t('Début')}
                            onChange={(value) => updateSlot('start', value)}
                            part="time"
                            value={dateFromLocalTime(date, slot.start)}
                          />
                          <NativeDatePartField
                            label={t('Fin')}
                            onChange={(value) => updateSlot('end', value)}
                            part="time"
                            value={dateFromLocalTime(date, slot.end)}
                          />
                          <IconButton
                            accessibilityLabel={t('Supprimer ce créneau')}
                            icon="trash-outline"
                            iconColor={palette.muted}
                            onPress={() =>
                              updateSlots(
                                date,
                                slots.filter(
                                  (_candidate, candidateIndex) => candidateIndex !== index,
                                ),
                              )
                            }
                            variant="plain"
                          />
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
            <EmptyState
              icon="moon-outline"
              message={t('Aucune date cochée — tu apparais comme indisponible.')}
              title={t("Aucune date pour l'instant")}
            />
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
  card: { gap: spacing.sm },
  content: { gap: spacing.md, padding: spacing.gutter, paddingBottom: spacing.xxl },
  dateCards: { gap: spacing.sm },
  // Touche accent : le jour coché est enfoncé dans le calendrier.
  dateIcon: {
    alignItems: 'center',
    borderRadius: radii.xs,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  error: { textAlign: 'center' },
  flex: { flex: 1 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  icon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  slotError: { flexBasis: '100%', textAlign: 'center' },
  slotHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  slotRow: {
    alignItems: 'center',
    borderRadius: radii.button,
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
  unsavedBanner: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.sm,
  },
});
