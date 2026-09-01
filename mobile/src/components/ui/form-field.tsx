import type { ComponentProps } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, typography } from '@/theme/tokens';

interface FormFieldProps extends ComponentProps<typeof TextInput> {
  error?: string | undefined;
  label: string;
}

export function FormField({ error, label, style, ...props }: FormFieldProps) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.wrapper}>
      <AppText color={palette.bronze} variant="label">
        {label}
      </AppText>
      <TextInput
        {...props}
        placeholderTextColor={palette.muted}
        selectionColor={palette.electric}
        style={[
          styles.input,
          {
            backgroundColor: palette.inset,
            borderColor: error ? palette.error : palette.border,
            color: palette.text,
          },
          style,
        ]}
      />
      {error ? (
        <AppText color={palette.error} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: radii.button,
    borderWidth: 1,
    fontFamily: typography.body,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  wrapper: { gap: 7 },
});
