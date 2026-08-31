import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, radii, spacing } from '@/theme/tokens';

interface DispoButtonProps extends PropsWithChildren {
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'signal';
}

export function DispoButton({
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  loading = false,
  onPress,
  variant = 'primary',
}: DispoButtonProps) {
  const { palette } = useDispoTheme();
  const reduceMotion = useReducedMotion();
  const inactive = disabled || loading;
  const foreground =
    variant === 'primary' ? billetInk : variant === 'signal' ? '#FFFFFF' : palette.text;
  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Ionicons color={foreground} name={icon} size={18} />
      ) : null}
      <AppText color={foreground} style={styles.label}>
        {children}
      </AppText>
    </View>
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={inactive}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.pressable,
        pressed && !inactive && (reduceMotion ? styles.pressedReduced : styles.pressed),
        inactive && styles.disabled,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={gradients.hero}
          end={{ x: 0, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.surface}
        >
          {content}
        </LinearGradient>
      ) : variant === 'signal' ? (
        <View style={[styles.surface, { backgroundColor: palette.signal }]}>{content}</View>
      ) : (
        <View
          style={[
            styles.surface,
            styles.outline,
            {
              backgroundColor: palette.card,
              borderColor: variant === 'danger' ? palette.error : palette.border,
            },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  label: { fontSize: 15, fontWeight: '800' },
  outline: { borderWidth: 1 },
  pressable: { borderRadius: radii.button },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  pressedReduced: { opacity: 0.96 },
  surface: {
    borderRadius: radii.button,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
