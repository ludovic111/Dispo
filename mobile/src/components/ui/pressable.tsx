import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import {
  billetInk,
  disabledStyle,
  gradients,
  minimumTouchTarget,
  onAccent,
  pressedStyle,
  pressedStyleReducedMotion,
  radii,
  spacing,
  tint,
} from '@/theme/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'signal';

interface DispoButtonProps extends PropsWithChildren {
  accessibilityLabel?: string | undefined;
  disabled?: boolean | undefined;
  icon?: ComponentProps<typeof Ionicons>['name'] | undefined;
  loading?: boolean | undefined;
  onPress: () => void;
  /** `regular` (50 pt) pour les actions d'écran, `compact` (40 pt visibles, zone tactile 44) pour les actions en ligne. */
  size?: 'regular' | 'compact' | undefined;
  variant?: ButtonVariant | undefined;
}

/**
 * Bouton unique de Dispo.
 * - `primary` : dégradé bleu jazz, encre sombre — une seule action principale par écran.
 * - `secondary` : surface en creux, texte courant.
 * - `ghost` : sans fond, texte accent (actions tertiaires, liens).
 * - `danger` : contour erreur.
 * - `signal` : fond orange, réservé au SOS.
 */
export function DispoButton({
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  loading = false,
  onPress,
  size = 'regular',
  variant = 'primary',
}: DispoButtonProps) {
  const { palette } = useDispoTheme();
  const reduceMotion = useReducedMotion();
  const inactive = disabled || loading;
  const foreground =
    variant === 'primary'
      ? billetInk
      : variant === 'signal'
        ? onAccent
        : variant === 'ghost'
          ? palette.electric
          : variant === 'danger'
            ? palette.error
            : palette.text;
  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : icon ? (
        <Ionicons color={foreground} name={icon} size={size === 'compact' ? 16 : 18} />
      ) : null}
      <AppText
        color={foreground}
        numberOfLines={1}
        style={styles.label}
        variant={size === 'compact' ? 'subheadline' : 'callout'}
        weight="bold"
      >
        {children}
      </AppText>
    </View>
  );
  const surface = [styles.surface, size === 'compact' && styles.compactSurface];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      hitSlop={size === 'compact' ? spacing.xxs : undefined}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.pressable,
        pressed && !inactive && (reduceMotion ? pressedStyleReducedMotion : pressedStyle),
        inactive && disabledStyle,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={gradients.hero}
          end={{ x: 1, y: 0.78 }}
          start={{ x: 0, y: 0.22 }}
          style={surface}
        >
          {content}
        </LinearGradient>
      ) : variant === 'signal' ? (
        <View style={[surface, { backgroundColor: palette.signal }]}>{content}</View>
      ) : variant === 'ghost' ? (
        <View style={surface}>{content}</View>
      ) : (
        <View
          style={[
            surface,
            styles.outline,
            {
              backgroundColor: variant === 'danger' ? 'transparent' : palette.cardMuted,
              borderColor: variant === 'danger' ? tint(palette.error, 0.6) : palette.border,
            },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

interface IconButtonProps {
  accessibilityLabel: string;
  badge?: number | undefined;
  disabled?: boolean | undefined;
  icon: ComponentProps<typeof Ionicons>['name'];
  iconColor?: string | undefined;
  loading?: boolean | undefined;
  onPress: () => void;
  /** Pour les poignées de glisser-déposer. */
  onPressIn?: (() => void) | undefined;
  /** `filled` : pastille sur surface en creux · `plain` : icône seule · `accent` : pastille pleine bleu jazz. */
  variant?: 'filled' | 'plain' | 'accent' | undefined;
}

/** Bouton icône circulaire (cloche, réglages, partage, fermer…). Une seule forme dans toute l'app. */
export function IconButton({
  accessibilityLabel,
  badge,
  disabled = false,
  icon,
  iconColor,
  loading = false,
  onPress,
  onPressIn,
  variant = 'filled',
}: IconButtonProps) {
  const { palette } = useDispoTheme();
  const inactive = disabled || loading;
  const foreground = variant === 'accent' ? palette.textInverse : (iconColor ?? palette.electric);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={loading ? { busy: true, disabled: true } : { disabled: inactive }}
      disabled={inactive}
      hitSlop={spacing.xxs}
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [
        styles.iconButton,
        variant === 'filled' && { backgroundColor: palette.cardMuted, borderColor: palette.border },
        variant === 'filled' && styles.outline,
        variant === 'accent' && { backgroundColor: palette.electric },
        pressed && pressedStyle,
        inactive && disabledStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <Ionicons color={foreground} name={icon} size={20} />
      )}
      {badge ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: palette.signal, borderColor: palette.background },
          ]}
        >
          <AppText color={onAccent} style={styles.badgeText} variant="caption2" weight="bold">
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 20,
    minWidth: 20,
    paddingHorizontal: spacing.xxs,
    position: 'absolute',
    right: -6,
    top: -6,
  },
  badgeText: { lineHeight: 13 },
  compactSurface: { minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  label: { flexShrink: 1, textAlign: 'center' },
  outline: { borderWidth: StyleSheet.hairlineWidth },
  pressable: { borderRadius: radii.button },
  surface: {
    borderRadius: radii.button,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
