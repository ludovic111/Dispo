import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, radii, spacing } from '@/theme/tokens';

export function ChoiceChip({
  icon,
  label,
  onPress,
  selected,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        {
          backgroundColor: selected ? `${palette.electric}26` : palette.card,
          borderColor: selected ? `${palette.electric}8F` : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {icon ? (
          <Ionicons color={selected ? palette.electric : palette.muted} name={icon} size={14} />
        ) : null}
        <AppText
          color={selected ? palette.electric : palette.text}
          numberOfLines={1}
          style={styles.label}
          variant="subheadline"
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  label: { flexShrink: 1, fontWeight: '700' },
  pressable: {
    borderRadius: radii.chip,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    maxWidth: '100%',
    paddingVertical: spacing.tight,
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
});
