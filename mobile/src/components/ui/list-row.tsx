import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
} from 'react-native';

import { AppText } from './app-text';
import { Card } from './card';

import { useDispoTheme } from '@/theme/theme-context';
import { disabledStyle, minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

interface ListRowProps {
  accessibilityLabel?: string | undefined;
  accessibilityRole?: AccessibilityRole | undefined;
  accessibilityState?: AccessibilityState | undefined;
  /** Contenu à droite (badge, valeur, interrupteur). Par défaut : chevron si `onPress`. */
  accessory?: ReactNode | undefined;
  disabled?: boolean | undefined;
  /** Icône ou avatar à gauche. */
  leading?: ReactNode | undefined;
  leadingIcon?: ComponentProps<typeof Ionicons>['name'] | undefined;
  leadingIconColor?: string | undefined;
  onPress?: (() => void) | undefined;
  subtitle?: string | undefined;
  title: string;
  /** Lignes du titre (1 par défaut ; 2 pour les titres saisis par les utilisateurs). */
  titleLines?: number | undefined;
  /** `card` : ligne autonome sur une carte (défaut) · `plain` : ligne dans une liste groupée. */
  tone?: 'card' | 'plain' | undefined;
}

/**
 * Ligne de liste standard (groupe, membre, réglage, conversation…) :
 * élément à gauche, titre + sous-titre, accessoire à droite.
 */
export function ListRow({
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  accessory,
  disabled = false,
  leading,
  leadingIcon,
  leadingIconColor,
  onPress,
  subtitle,
  title,
  titleLines = 1,
  tone = 'card',
}: ListRowProps) {
  const { palette } = useDispoTheme();
  const state = { ...accessibilityState, disabled };
  const content = (
    <View style={[styles.row, disabled && disabledStyle]}>
      {leading ??
        (leadingIcon ? (
          <View style={[styles.iconWell, { backgroundColor: palette.cardMuted }]}>
            <Ionicons color={leadingIconColor ?? palette.electric} name={leadingIcon} size={20} />
          </View>
        ) : null)}
      <View style={styles.copy}>
        <AppText numberOfLines={titleLines} variant="headline">
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={palette.muted} numberOfLines={2} variant="subheadline">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {accessory ??
        (onPress ? <Ionicons color={palette.muted} name="chevron-forward" size={18} /> : null)}
    </View>
  );
  if (tone === 'plain') {
    return onPress ? (
      <Pressable
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityRole={accessibilityRole}
        accessibilityState={state}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.plain, pressed && pressedStyle]}
      >
        {content}
      </Pressable>
    ) : (
      <View style={styles.plain}>{content}</View>
    );
  }
  return onPress ? (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole={accessibilityRole}
      accessibilityState={state}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <Card padding={spacing.sm}>{content}</Card>
    </Pressable>
  ) : (
    <Card padding={spacing.sm}>{content}</Card>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: 2, minWidth: 0 },
  iconWell: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  plain: { minHeight: minimumTouchTarget, paddingVertical: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
});
