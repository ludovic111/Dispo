import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, radii, spacing } from '@/theme/tokens';

export type NativeDateTimePart = 'date' | 'time';

/** Keep the untouched local calendar fields stable when a native picker changes one part. */
export function mergeNativeDateTimePart(
  current: Date,
  picked: Date,
  part: NativeDateTimePart,
): Date {
  const merged = new Date(current);
  if (part === 'date') {
    merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  } else {
    merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  }
  return merged;
}

interface NativeDateTimeFieldProps {
  dateLabel: string;
  disabled?: boolean | undefined;
  minimumDate?: Date | undefined;
  onChange: (value: Date) => void;
  /** `both` (défaut) : date et heure · `date` : jour seul · `time` : heure seule. */
  parts?: 'both' | 'date' | 'time' | undefined;
  timeLabel?: string | undefined;
  value: Date;
}

/** Sélecteur de date / heure natif : champs compacts sur iOS, boîtes de dialogue sur Android. */
export function NativeDateTimeField({
  dateLabel,
  disabled = false,
  minimumDate,
  onChange,
  parts = 'both',
  timeLabel = '',
  value,
}: NativeDateTimeFieldProps) {
  const showDate = parts !== 'time';
  const showTime = parts !== 'date';
  const { dark, palette } = useDispoTheme();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const dateMinimum = minimumDate
    ? new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate())
    : undefined;

  const apply = (picked: Date, part: NativeDateTimePart) => {
    onChange(mergeNativeDateTimePart(value, picked, part));
  };
  const openAndroid = (part: NativeDateTimePart) => {
    if (disabled) return;
    DateTimePickerAndroid.open({
      display: 'default',
      ...(part === 'date' && dateMinimum ? { minimumDate: dateMinimum } : {}),
      mode: part,
      onValueChange: (_event: DateTimePickerChangeEvent, picked: Date) => apply(picked, part),
      value,
    });
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.row}>
        {showDate ? (
          <View style={[styles.iosField, { backgroundColor: palette.inset }]}>
            <AppText color={palette.muted} variant="caption">
              {dateLabel}
            </AppText>
            <DateTimePicker
              accentColor={palette.electric}
              display="compact"
              disabled={disabled}
              {...(dateMinimum ? { minimumDate: dateMinimum } : {})}
              mode="date"
              onValueChange={(_event, picked) => apply(picked, 'date')}
              textColor={disabled ? palette.muted : palette.text}
              themeVariant={dark ? 'dark' : 'light'}
              value={value}
            />
          </View>
        ) : null}
        {showTime ? (
          <View style={[styles.iosField, { backgroundColor: palette.inset }]}>
            <AppText color={palette.muted} variant="caption">
              {timeLabel}
            </AppText>
            <DateTimePicker
              accentColor={palette.electric}
              display="compact"
              disabled={disabled}
              mode="time"
              onValueChange={(_event, picked) => apply(picked, 'time')}
              textColor={disabled ? palette.muted : palette.text}
              themeVariant={dark ? 'dark' : 'light'}
              value={value}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const dateText = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value);
  const timeText = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
  return (
    <View style={styles.row}>
      {showDate ? (
        <Pressable
          accessibilityLabel={`${dateLabel}: ${dateText}`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => openAndroid('date')}
          style={({ pressed }) => [
            styles.androidField,
            { backgroundColor: palette.inset, borderColor: palette.border },
            pressed && pressedStyle,
          ]}
        >
          <AppText color={palette.muted} variant="caption">
            {dateLabel}
          </AppText>
          <AppText color={disabled ? palette.muted : palette.text}>{dateText}</AppText>
        </Pressable>
      ) : null}
      {showTime ? (
        <Pressable
          accessibilityLabel={`${timeLabel}: ${timeText}`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => openAndroid('time')}
          style={({ pressed }) => [
            styles.androidField,
            { backgroundColor: palette.inset, borderColor: palette.border },
            pressed && pressedStyle,
          ]}
        >
          <AppText color={palette.muted} variant="caption">
            {timeLabel}
          </AppText>
          <AppText color={disabled ? palette.muted : palette.text}>{timeText}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  androidField: {
    borderRadius: radii.input,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xxs,
    minHeight: 60,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  iosField: {
    alignItems: 'flex-start',
    borderRadius: radii.input,
    flex: 1,
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  row: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.sm },
});
