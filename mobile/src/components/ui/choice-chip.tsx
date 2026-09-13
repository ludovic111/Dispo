import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import {
  disabledStyle,
  minimumTouchTarget,
  pressedStyle,
  radii,
  spacing,
  tint,
} from '@/theme/tokens';

/** Puce de choix (filtres, sélections multiples). Sélection = teinte bleu jazz. */
export function ChoiceChip({
  disabled = false,
  icon,
  label,
  onPress,
  selected,
}: {
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { palette } = useDispoTheme();
  const foreground = selected ? palette.electric : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        {
          backgroundColor: selected ? tint(palette.electric, 0.16) : palette.card,
          borderColor: selected ? tint(palette.electric, 0.55) : palette.border,
        },
        pressed && pressedStyle,
        disabled && disabledStyle,
      ]}
    >
      <View style={styles.content}>
        {icon ? (
          <Ionicons color={selected ? palette.electric : palette.muted} name={icon} size={14} />
        ) : null}
        <AppText
          color={foreground}
          numberOfLines={1}
          style={styles.label}
          variant="subheadline"
          weight="semibold"
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  label: { flexShrink: 1 },
  pressable: {
    borderRadius: radii.round,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: minimumTouchTarget - 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.tight,
  },
});
