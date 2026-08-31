import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, spacing } from '@/theme/tokens';

export function NativeHeaderButton({
  disabled = false,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
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
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon ? (
        <Ionicons color={palette.electric} name={icon} size={22} />
      ) : (
        <AppText color={palette.electric} numberOfLines={1} style={styles.label}>
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
  disabled: { opacity: 0.45 },
  label: { fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
