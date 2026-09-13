import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { IconButton } from './pressable';

import { useDispoTheme } from '@/theme/theme-context';
import {
  billetInk,
  disabledStyle,
  gradients,
  minimumTouchTarget,
  onAccent,
  pressedStyle,
  radii,
  spacing,
  tint,
} from '@/theme/tokens';

/**
 * En-tête de section : le seul style de titre de section de l'app.
 * Titre Fraunces, sous-titre optionnel, action textuelle optionnelle à droite
 * (« Modifier », « Tout voir », « Créer »).
 */
export function SectionHeader({
  accessory,
  action,
  subtitle,
  title,
}: {
  /** Élément à droite sans action (compteur, badge). Ignoré si `action` est fourni. */
  accessory?: ReactNode;
  action?:
    | {
        accessibilityLabel?: string | undefined;
        disabled?: boolean | undefined;
        icon?: ComponentProps<typeof Ionicons>['name'] | undefined;
        label: string;
        onPress: () => void;
      }
    | undefined;
  subtitle?: string | undefined;
  title: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionCopy}>
        <AppText numberOfLines={2} variant="title3">
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={palette.muted} variant="footnote">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          accessibilityRole="button"
          accessibilityState={{ disabled: action.disabled ?? false }}
          disabled={action.disabled ?? false}
          hitSlop={spacing.xs}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.sectionAction,
            pressed && pressedStyle,
            action.disabled && disabledStyle,
          ]}
        >
          {action.icon ? <Ionicons color={palette.electric} name={action.icon} size={16} /> : null}
          <AppText color={palette.electric} variant="subheadline" weight="semibold">
            {action.label}
          </AppText>
        </Pressable>
      ) : (
        (accessory ?? null)
      )}
    </View>
  );
}

/** Bouton pilule de filtre / segment. */
export function PillButton({
  active = false,
  badge,
  icon,
  onPress,
  title,
}: {
  active?: boolean | undefined;
  badge?: number | undefined;
  icon?: ComponentProps<typeof Ionicons>['name'] | undefined;
  onPress: () => void;
  title: string;
}) {
  const { palette } = useDispoTheme();
  const foreground = active ? palette.electric : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? tint(palette.electric, 0.16) : palette.cardMuted,
          borderColor: active ? tint(palette.electric, 0.5) : palette.border,
        },
        pressed && pressedStyle,
      ]}
    >
      {icon ? <Ionicons color={foreground} name={icon} size={15} /> : null}
      <AppText
        color={foreground}
        numberOfLines={1}
        style={styles.pillText}
        variant="subheadline"
        weight="semibold"
      >
        {title}
      </AppText>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: tint(foreground, 0.14) }]}>
          <AppText color={foreground} variant="caption2" weight="bold">
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function PromoBanner({
  icon,
  onPress,
  style = 'premium',
  subtitle,
  title,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  style?: 'premium' | 'hero';
  subtitle: string;
  title: string;
}) {
  const foreground = style === 'hero' ? billetInk : onAccent;
  const colors = style === 'hero' ? gradients.hero : gradients.premium;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <LinearGradient colors={colors} style={styles.promo}>
        <View style={[styles.promoIcon, { backgroundColor: tint(foreground, 0.14) }]}>
          <Ionicons color={foreground} name={icon} size={20} />
        </View>
        <View style={styles.promoCopy}>
          <AppText color={foreground} variant="subheadline" weight="bold">
            {title}
          </AppText>
          <AppText color={foreground} style={styles.promoSubtitle} variant="caption">
            {subtitle}
          </AppText>
        </View>
        <Ionicons color={tint(foreground, 0.7)} name="chevron-forward" size={16} />
      </LinearGradient>
    </Pressable>
  );
}

/** Alias conservé : bouton icône d'en-tête. Préférer `IconButton`. */
export function HeaderAction({
  badge,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  badge?: number;
  disabled?: boolean;
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <IconButton
      accessibilityLabel={label}
      badge={badge}
      disabled={disabled}
      icon={icon}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: radii.round,
    minWidth: 20,
    paddingHorizontal: spacing.tight,
    paddingVertical: 1,
  },
  pill: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.tight,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillText: { flexShrink: 1 },
  promo: {
    alignItems: 'center',
    borderRadius: radii.promo,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  promoCopy: { flex: 1, gap: 2 },
  promoIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  promoSubtitle: { opacity: 0.85 },
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: minimumTouchTarget - 8,
    justifyContent: 'center',
  },
  sectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minWidth: 0,
  },
});
