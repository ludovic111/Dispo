import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { disabledStyle, minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

interface NativeDatePartFieldProps {
  disabled?: boolean;
  label: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onChange: (value: Date) => void;
  /** `date` : jour seul · `time` : heure seule. */
  part: 'date' | 'time';
  value: Date;
}

/**
 * Sélecteur natif d'une seule partie (jour ou heure), même forme que
 * `NativeDateTimeField` : champ compact iOS, boîte de dialogue Android.
 */
export function NativeDatePartField({
  disabled = false,
  label,
  maximumDate,
  minimumDate,
  onChange,
  part,
  value,
}: NativeDatePartFieldProps) {
  const { dark, palette } = useDispoTheme();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const bounds = {
    ...(part === 'date' && maximumDate ? { maximumDate } : {}),
    ...(part === 'date' && minimumDate ? { minimumDate } : {}),
  };

  if (Platform.OS === 'ios') {
    return (
      <View
        style={[styles.iosField, { backgroundColor: palette.inset }, disabled && disabledStyle]}
      >
        <AppText color={palette.muted} variant="caption">
          {label}
        </AppText>
        <DateTimePicker
          accentColor={palette.electric}
          display="compact"
          disabled={disabled}
          {...bounds}
          mode={part}
          onValueChange={(_event, picked) => onChange(picked)}
          textColor={disabled ? palette.muted : palette.text}
          themeVariant={dark ? 'dark' : 'light'}
          value={value}
        />
      </View>
    );
  }

  const text =
    part === 'date'
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value)
      : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(value);
  return (
    <Pressable
      accessibilityLabel={`${label}: ${text}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() =>
        DateTimePickerAndroid.open({
          display: 'default',
          ...bounds,
          mode: part,
          onValueChange: (_event: DateTimePickerChangeEvent, picked: Date) => onChange(picked),
          value,
        })
      }
      style={({ pressed }) => [
        styles.androidField,
        { backgroundColor: palette.inset, borderColor: palette.border },
        pressed && pressedStyle,
        disabled && disabledStyle,
      ]}
    >
      <AppText color={palette.muted} variant="caption">
        {label}
      </AppText>
      <AppText color={disabled ? palette.muted : palette.text}>{text}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  androidField: {
    borderRadius: radii.button,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xxs,
    minHeight: 60,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  iosField: {
    alignItems: 'flex-start',
    borderRadius: radii.button,
    flex: 1,
    gap: spacing.xxs,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
});
