import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import {
  disabledStyle,
  elevation,
  insetStyle,
  keyHighlight,
  minimumTouchTarget,
  pressedStyle,
  radii,
  spacing,
} from '@/theme/tokens';

/**
 * Puce de choix (filtres, sélections multiples). Au repos : en creux dans la
 * surface ; sélectionnée : touche accent pleine avec son liseré clair.
 */
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
  const foreground = selected ? palette.accentInk : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        selected
          ? [
              { backgroundColor: palette.accent, borderColor: palette.accentDeep },
              elevation(1, palette),
            ]
          : insetStyle(palette),
        pressed && pressedStyle,
        disabled && disabledStyle,
      ]}
    >
      {selected ? (
        <View pointerEvents="none" style={[styles.highlight, { backgroundColor: keyHighlight }]} />
      ) : null}
      <View style={styles.content}>
        {icon ? (
          <Ionicons color={selected ? palette.accentInk : palette.muted} name={icon} size={14} />
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
  highlight: { height: 1, left: radii.md, position: 'absolute', right: radii.md, top: 0 },
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
