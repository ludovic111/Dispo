import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import {
  disabledStyle,
  minimumTouchTarget,
  pressedStyleReducedMotion,
  spacing,
} from '@/theme/tokens';

export function NativeHeaderButton({
  disabled = false,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean | undefined;
  icon?: ComponentProps<typeof Ionicons>['name'] | undefined;
  label: string;
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={spacing.xs}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && pressedStyleReducedMotion,
        disabled && disabledStyle,
      ]}
    >
      {icon ? (
        <Ionicons color={palette.electric} name={icon} size={22} />
      ) : (
        <AppText color={palette.electric} numberOfLines={1} variant="callout" weight="semibold">
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    minWidth: minimumTouchTarget,
    paddingHorizontal: spacing.xs,
  },
});
