import { forwardRef, type ComponentProps } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { insetInputStyle, radii, spacing, typography } from '@/theme/tokens';

interface FormFieldProps extends ComponentProps<typeof TextInput> {
  error?: string | undefined;
  /** Texte d'aide sous le champ, remplacé par l'erreur le cas échéant. */
  hint?: string;
  label: string;
}

/** Champ de formulaire : étiquette mono, champ en creux, erreur en dessous. */
export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { error, hint, label, style, ...props },
  ref,
) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.wrapper}>
      <AppText color={palette.bronze} variant="label">
        {label}
      </AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ?? label}
        numberOfLines={props.multiline ? undefined : 1}
        {...props}
        placeholderTextColor={palette.muted}
        selectionColor={palette.electric}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          insetInputStyle(palette),
          { color: palette.text },
          error
            ? {
                borderBottomColor: palette.error,
                borderColor: palette.error,
                borderTopColor: palette.error,
              }
            : null,
          style,
        ]}
      />
      {error ? (
        <AppText color={palette.error} variant="caption">
          {error}
        </AppText>
      ) : hint ? (
        <AppText color={palette.muted} variant="caption">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    borderRadius: radii.input,
    fontFamily: typography.body,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  wrapper: { gap: spacing.tight },
});
