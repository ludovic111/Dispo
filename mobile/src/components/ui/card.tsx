import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, surfaceStyle, type SurfaceTone } from '@/theme/tokens';

interface CardProps extends ViewProps {
  padding?: number;
  /**
   * `gradient` (défaut) : dégradé vertical subtil haut → bas · `flat` :
   * couleur pleine, pour les listes très longues.
   */
  surface?: 'gradient' | 'flat';
  /**
   * `default` : surface principale · `elevated` : surface au-dessus ·
   * `inset` : surface en creux · `muted` : surface secondaire plate.
   */
  tone?: SurfaceTone;
}

/**
 * Surface de base de Dispo, façon « Backstage » : dégradé vertical léger,
 * liseré clair en haut, arête un peu plus sombre que la surface et ombre
 * portée. `inset` s'enfonce dans la surface au lieu d'en ressortir.
 */
export function Card({
  children,
  padding = spacing.md,
  style,
  surface = 'gradient',
  tone = 'default',
  ...props
}: PropsWithChildren<CardProps>) {
  const { palette } = useDispoTheme();
  const surfaceStyles = surfaceStyle(palette, tone);
  const flattened = StyleSheet.flatten(style);
  const radius = flattened?.borderRadius ?? radii.card;
  const innerRadius = typeof radius === 'number' ? Math.max(0, radius - 1) : radius;
  // Une couleur de fond posée par l'écran prime sur le dégradé de surface.
  const showGradient =
    surface === 'gradient' &&
    surfaceStyles.gradient?.every(Boolean) &&
    flattened?.backgroundColor === undefined;
  return (
    <View {...props} style={[styles.card, surfaceStyles.container, { padding }, style]}>
      {showGradient && surfaceStyles.gradient ? (
        <LinearGradient
          colors={surfaceStyles.gradient}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: innerRadius }]}
        />
      ) : null}
      {surfaceStyles.highlight ? (
        <View
          pointerEvents="none"
          style={[
            surfaceStyles.highlight,
            typeof radius === 'number' ? { left: radius, right: radius } : null,
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: radii.card },
});
