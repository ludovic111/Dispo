import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  availableDayKey,
  normalizeAvailableDates,
  toggleAvailableDate,
} from './profile-availability-model';
import { fetchAvailableDates, saveAvailableDates } from './profile-edit-repository';
import { profileKeys } from './profile-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction, SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function ProfileAvailabilityScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: () => fetchAvailableDates(userId),
    queryKey: ['profile', 'availability', userId],
  });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(Platform.OS === 'ios');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const dates = draft ?? query.data ?? [];
  const close = <HeaderAction icon="close" label={t('Fermer')} onPress={() => router.back()} />;

  const updateDay = (date: Date) => {
    setCalendarDate(date);
    setDraft(toggleAvailableDate(dates, availableDayKey(date)));
    setErrorText(null);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      const normalized = normalizeAvailableDates(dates);
      await saveAvailableDates(userId, normalized);
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

  if (query.isLoading) {
    return (
      <Screen>
        <ScreenHeader action={close} eyebrow={t('Profil')} title={t('Mes disponibilités')} />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen>
        <ScreenHeader action={close} eyebrow={t('Profil')} title={t('Mes disponibilités')} />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader action={close} eyebrow={t('Profil')} title={t('Mes disponibilités')} />
      <ScrollView contentContainerStyle={styles.content}>
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
                    { onPress: () => setDraft([]), style: 'destructive', text: t('Tout retirer') },
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

        <Card padding={0}>
          {dates.length ? (
            dates.map((date, index) => (
              <Pressable
                accessibilityHint={t('Retire cette date de tes disponibilités')}
                accessibilityRole="button"
                key={date}
                onPress={() => setDraft(dates.filter((value) => value !== date))}
                style={({ pressed }) => [
                  styles.dateRow,
                  index > 0 && {
                    borderTopColor: palette.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.dateIcon, { backgroundColor: `${palette.jam}18` }]}>
                  <Ionicons color={palette.jam} name="checkmark" size={17} />
                </View>
                <AppText style={styles.flex} variant="subheadline">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'full',
                  }).format(new Date(`${date}T12:00:00`))}
                </AppText>
                <Ionicons color={palette.muted} name="close-circle" size={21} />
              </Pressable>
            ))
          ) : (
            <View style={styles.empty}>
              <Ionicons color={palette.muted} name="moon-outline" size={25} />
              <AppText color={palette.muted} style={styles.emptyText} variant="caption">
                {t('Aucune date cochée — tu apparais comme indisponible.')}
              </AppText>
            </View>
          )}
        </Card>

        {errorText ? (
          <AppText color={palette.signal} style={styles.error} variant="caption">
            {errorText}
          </AppText>
        ) : null}
        <DispoButton loading={saving} onPress={() => void save()}>
          {t('Enregistrer mes disponibilités')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  clearButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.tight,
  },
  content: { gap: spacing.md, padding: spacing.gutter, paddingBottom: spacing.xxl },
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
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
