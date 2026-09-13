import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { fontWeights, typography } from '@/theme/tokens';

/**
 * Échelle typographique unique de Dispo.
 *
 * Fraunces (éditorial) : `display`, `displayItalic`, `title2`, `title3`.
 * Système (lecture, contrôles) : `title`, `headline`, `body`, `callout`,
 * `subheadline`, `footnote`, `caption`, `caption2`.
 * Spline Sans Mono (étiquettes, données) : `label`, `mono`.
 *
 * `secondary` est un alias hérité de `subheadline`.
 */
export type TextVariant =
  | 'body'
  | 'callout'
  | 'caption'
  | 'caption2'
  | 'display'
  | 'displayItalic'
  | 'footnote'
  | 'headline'
  | 'label'
  | 'mono'
  | 'secondary'
  | 'subheadline'
  | 'title'
  | 'title2'
  | 'title3';

export type TextWeight = keyof typeof fontWeights;

interface AppTextProps extends ComponentProps<typeof Text> {
  color?: string;
  variant?: TextVariant;
  /** Graisse système (ignorée par les variantes Fraunces et mono, qui ont leur propre fonte). */
  weight?: TextWeight;
}

export function AppText({ color, style, variant = 'body', weight, ...props }: AppTextProps) {
  const { palette } = useDispoTheme();
  return (
    <Text
      {...props}
      style={[
        styles.base,
        styles[variant],
        weight ? { fontWeight: fontWeights[weight] } : null,
        { color: color ?? palette.text },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: typography.body, fontSize: 17, lineHeight: 22 },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 14, fontWeight: fontWeights.medium },
  display: { fontFamily: typography.display, fontSize: 28, lineHeight: 33 },
  displayItalic: { fontFamily: typography.displayItalic, fontSize: 28, lineHeight: 33 },
  footnote: { fontSize: 13, lineHeight: 18 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: fontWeights.semibold },
  label: {
    fontFamily: typography.monoSemibold,
    fontSize: 11,
    letterSpacing: 0.8,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  mono: { fontFamily: typography.mono, fontSize: 13, lineHeight: 18 },
  secondary: { fontSize: 15, lineHeight: 20 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: fontWeights.bold },
  title2: { fontFamily: typography.display, fontSize: 22, lineHeight: 27 },
  title3: { fontFamily: typography.display, fontSize: 19, lineHeight: 24 },
});
