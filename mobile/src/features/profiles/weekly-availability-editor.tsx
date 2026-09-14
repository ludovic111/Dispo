import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { NativeDatePartField } from './native-date-part-field';
import {
  availableDayKey,
  dateFromLocalTime,
  defaultAvailabilityTimeSlot,
  localTimeValue,
  isValidAvailabilityTimeSlot,
  type WeeklyAvailability,
} from './profile-availability-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function WeeklyAvailabilityEditor({
  value,
  onChange,
}: {
  value: WeeklyAvailability;
  onChange: (value: WeeklyAvailability) => void;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const days = [1, 2, 3, 4, 5, 6, 0];
  const locale = i18n.resolvedLanguage ?? 'fr';
  const label = (day: number) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2026, 8, 13 + day, 12));
  const timeDay = availableDayKey(new Date());
  return (
    <Card style={styles.content}>
      <SectionHeader
        title={t('Disponibilités récurrentes')}
        subtitle={t('Chaque semaine, aux mêmes horaires.')}
      />
      <View style={styles.days}>
        {days.map((day) => (
          <ChoiceChip
            key={day}
            label={label(day)}
            selected={Object.hasOwn(value, String(day))}
            onPress={() => {
              const next = { ...value };
              if (Object.hasOwn(next, String(day))) delete next[String(day)];
              else next[String(day)] = [];
              onChange(next);
            }}
          />
        ))}
      </View>
      {days
        .filter((day) => Object.hasOwn(value, String(day)))
        .map((day) => {
          const slots = value[String(day)] ?? [];
          return (
            <View key={day} style={styles.content}>
              <View style={styles.row}>
                <AppText style={styles.flex} weight="semibold">
                  {label(day)}
                </AppText>
                <DispoButton
                  icon="add-circle"
                  size="compact"
                  variant="ghost"
                  onPress={() =>
                    onChange({ ...value, [day]: [...slots, defaultAvailabilityTimeSlot(slots)] })
                  }
                >
                  {t('Ajouter un créneau')}
                </DispoButton>
              </View>
              {!slots.length ? (
                <AppText color={palette.muted} variant="caption">
                  {t('Toute la journée')}
                </AppText>
              ) : null}
              {slots.map((slot, index) => (
                <View key={`${day}-${index}`} style={styles.row}>
                  <NativeDatePartField
                    label={t('Début')}
                    part="time"
                    value={dateFromLocalTime(timeDay, slot.start)}
                    onChange={(date) =>
                      onChange({
                        ...value,
                        [day]: slots.map((item, i) =>
                          i === index ? { ...item, start: localTimeValue(date) } : item,
                        ),
                      })
                    }
                  />
                  <NativeDatePartField
                    label={t('Fin')}
                    part="time"
                    value={dateFromLocalTime(timeDay, slot.end)}
                    onChange={(date) =>
                      onChange({
                        ...value,
                        [day]: slots.map((item, i) =>
                          i === index ? { ...item, end: localTimeValue(date) } : item,
                        ),
                      })
                    }
                  />
                  <IconButton
                    accessibilityLabel={t('Supprimer ce créneau')}
                    icon="trash-outline"
                    variant="plain"
                    onPress={() =>
                      onChange({ ...value, [day]: slots.filter((_, i) => i !== index) })
                    }
                  />
                  {!isValidAvailabilityTimeSlot(slot) ? (
                    <AppText color={palette.signal} variant="caption">
                      {t("L'heure de fin doit suivre l'heure de début.")}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
});
