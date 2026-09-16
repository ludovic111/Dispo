import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { availableDayKey, type ProfileAvailability } from './profile-availability-model';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/pressable';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, tint } from '@/theme/tokens';

export function calendarMonthDays(month: Date): (string | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) =>
    index < offset || index >= offset + count
      ? null
      : availableDayKey(new Date(first.getFullYear(), first.getMonth(), index - offset + 1, 12)),
  );
}

export function availabilityForDay(availability: ProfileAvailability, day: string) {
  const explicit = availability.dates.includes(day);
  const weekly = availability.weekly?.[String(new Date(`${day}T12:00:00`).getDay())];
  return {
    kind: explicit ? 'explicit' : weekly ? 'weekly' : 'none',
    slots: explicit ? (availability.timeSlots[day] ?? []) : (weekly ?? []),
  } as const;
}

export function AvailabilityCalendar({
  availability,
  selectedDay,
  onSelect,
}: {
  availability: ProfileAvailability;
  selectedDay: string;
  onSelect: (day: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const locale = i18n.resolvedLanguage ?? 'fr';
  const [month, setMonth] = useState(() => new Date(`${selectedDay}T12:00:00`));
  const today = availableDayKey(new Date());
  const days = calendarMonthDays(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );
  const move = (offset: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1, 12));
  const statuses = {
    explicit: t('Date ponctuelle'),
    weekly: t('Disponibilité récurrente'),
    none: t('Indisponible'),
  };
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <IconButton
          accessibilityLabel={t('Mois précédent')}
          icon="chevron-back"
          onPress={() => move(-1)}
          variant="plain"
        />
        <AppText variant="headline" style={styles.month} accessibilityLiveRegion="polite">
          {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}
        </AppText>
        <IconButton
          accessibilityLabel={t('Mois suivant')}
          icon="chevron-forward"
          onPress={() => move(1)}
          variant="plain"
        />
      </View>
      <View style={styles.week}>
        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
          <View key={day} style={styles.column}>
            <AppText color={palette.muted} variant="caption">
              {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
                new Date(2026, 8, 13 + day, 12),
              )}
            </AppText>
          </View>
        ))}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.week}>
          {week.map((day, index) => {
            if (!day) return <View key={`blank-${index}`} style={styles.cell} />;
            const status = availabilityForDay(availability, day).kind;
            const selected = day === selectedDay;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date(`${day}T12:00:00`))}, ${statuses[status]}${day === today ? `, ${t("Aujourd'hui")}` : ''}`}
                onPress={() => onSelect(day)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    {
                      borderColor: selected
                        ? palette.electric
                        : day === today
                          ? palette.muted
                          : 'transparent',
                      backgroundColor: selected ? tint(palette.electric, 0.16) : 'transparent',
                    },
                  ]}
                >
                  <AppText weight={selected || day === today ? 'bold' : 'regular'}>
                    {Number(day.slice(-2))}
                  </AppText>
                  <View
                    style={[
                      styles.marker,
                      {
                        backgroundColor: status === 'explicit' ? palette.electric : 'transparent',
                        borderColor: status === 'weekly' ? palette.electric : 'transparent',
                        borderWidth: status === 'weekly' ? 1.5 : 0,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.marker, { backgroundColor: palette.electric }]} />
          <AppText color={palette.muted} variant="caption2">
            {t('Date ponctuelle')}
          </AppText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.marker, { borderColor: palette.electric, borderWidth: 1.5 }]} />
          <AppText color={palette.muted} variant="caption2">
            {t('Disponibilité récurrente')}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center' },
  month: { flex: 1, textAlign: 'center' },
  week: { flexDirection: 'row' },
  column: { flex: 1, alignItems: 'center' },
  cell: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  day: {
    width: '94%',
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  marker: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
