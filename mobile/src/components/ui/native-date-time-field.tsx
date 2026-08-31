import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

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
  minimumDate?: Date;
  onChange: (value: Date) => void;
  timeLabel: string;
  value: Date;
}

export function NativeDateTimeField({
  dateLabel,
  minimumDate,
  onChange,
  timeLabel,
  value,
}: NativeDateTimeFieldProps) {
  const { palette } = useDispoTheme();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const dateMinimum = minimumDate
    ? new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate())
    : undefined;

  const apply = (picked: Date, part: NativeDateTimePart) => {
    onChange(mergeNativeDateTimePart(value, picked, part));
  };
  const openAndroid = (part: NativeDateTimePart) => {
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
        <View style={[styles.iosField, { backgroundColor: palette.inset }]}>
          <AppText color={palette.muted} variant="caption">
            {dateLabel}
          </AppText>
          <DateTimePicker
            display="compact"
            {...(dateMinimum ? { minimumDate: dateMinimum } : {})}
            mode="date"
            onValueChange={(_event, picked) => apply(picked, 'date')}
            value={value}
          />
        </View>
        <View style={[styles.iosField, { backgroundColor: palette.inset }]}>
          <AppText color={palette.muted} variant="caption">
            {timeLabel}
          </AppText>
          <DateTimePicker
            display="compact"
            mode="time"
            onValueChange={(_event, picked) => apply(picked, 'time')}
            value={value}
          />
        </View>
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
      <Pressable
        accessibilityLabel={`${dateLabel}: ${dateText}`}
        accessibilityRole="button"
        onPress={() => openAndroid('date')}
        style={({ pressed }) => [
          styles.androidField,
          { backgroundColor: palette.inset, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <AppText color={palette.muted} variant="caption">
          {dateLabel}
        </AppText>
        <AppText>{dateText}</AppText>
      </Pressable>
      <Pressable
        accessibilityLabel={`${timeLabel}: ${timeText}`}
        accessibilityRole="button"
        onPress={() => openAndroid('time')}
        style={({ pressed }) => [
          styles.androidField,
          { backgroundColor: palette.inset, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <AppText color={palette.muted} variant="caption">
          {timeLabel}
        </AppText>
        <AppText>{timeText}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  androidField: {
    borderRadius: radii.button,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 60,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  iosField: {
    alignItems: 'flex-start',
    borderRadius: radii.button,
    flex: 1,
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 5,
  },
  pressed: { opacity: 0.72 },
  row: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.sm },
});
