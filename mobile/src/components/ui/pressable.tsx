import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import {
  blend,
  disabledStyle,
  elevation,
  keyHighlight,
  keyStyle,
  minimumTouchTarget,
  onAccent,
  pressedKeyStyle,
  pressedKeyStyleReducedMotion,
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
 * Bouton unique de Dispo, façon « touche » : remplissage plein, liseré clair
 * en haut, arête basse de 2 pt plus sombre ; à l'appui la touche descend
 * d'un point et l'arête disparaît.
 * - `primary` : accent du thème, encre lisible — une seule action principale par écran.
 * - `secondary` : surface relevée, texte courant.
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
      ? palette.accentInk
      : variant === 'signal'
        ? onAccent
        : variant === 'ghost'
          ? palette.electric
          : variant === 'danger'
            ? palette.error
            : palette.text;
  const raised = variant === 'primary' || variant === 'secondary' || variant === 'signal';
  const key =
    variant === 'primary'
      ? keyStyle(palette.accent, palette.accentDeep)
      : variant === 'signal'
        ? keyStyle(palette.signal, blend(palette.signal, palette.ink, 0.3))
        : variant === 'secondary'
          ? keyStyle(palette.cardElevated, palette.edge)
          : null;
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
        styles.surface,
        size === 'compact' && styles.compactSurface,
        key,
        variant === 'secondary' && [styles.outline, { borderColor: palette.edge }],
        variant === 'danger' && [styles.outline, { borderColor: tint(palette.error, 0.6) }],
        raised && !inactive && elevation(1, palette),
        pressed &&
          !inactive &&
          (raised
            ? reduceMotion
              ? pressedKeyStyleReducedMotion
              : pressedKeyStyle
            : reduceMotion
              ? pressedStyleReducedMotion
              : pressedStyle),
        inactive && disabledStyle,
      ]}
    >
      {raised ? (
        <View pointerEvents="none" style={[styles.highlight, { backgroundColor: keyHighlight }]} />
      ) : null}
      {content}
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
  /** `filled` : pastille relevée sur surface · `plain` : icône seule · `accent` : pastille pleine accent. */
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
  const foreground = variant === 'accent' ? palette.accentInk : (iconColor ?? palette.electric);
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
        variant === 'filled' && [
          styles.outline,
          { backgroundColor: palette.cardElevated, borderColor: palette.edge },
          elevation(1, palette),
        ],
        variant === 'accent' && [
          styles.outline,
          { backgroundColor: palette.accent, borderColor: palette.accentDeep },
        ],
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
  highlight: {
    height: 1,
    left: radii.button,
    position: 'absolute',
    right: radii.button,
    top: 0,
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
  surface: {
    borderRadius: radii.button,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
