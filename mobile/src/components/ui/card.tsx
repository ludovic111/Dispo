import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { cardShadow, radii, spacing } from '@/theme/tokens';

interface CardProps extends ViewProps {
  padding?: number;
  /** `default` : surface principale · `elevated` : surface au-dessus · `inset` : surface en creux. */
  tone?: 'default' | 'elevated' | 'inset';
}

/** Surface de base de Dispo : un rayon, une bordure, une ombre. Rien d'autre. */
export function Card({
  children,
  padding = spacing.md,
  style,
  tone = 'default',
  ...props
}: PropsWithChildren<CardProps>) {
  const { dark, palette } = useDispoTheme();
  const backgroundColor =
    tone === 'elevated'
      ? palette.cardElevated
      : tone === 'inset'
        ? palette.cardMuted
        : palette.card;
  return (
    <View
      {...props}
      style={[
        styles.card,
        tone === 'inset' ? null : cardShadow(dark ? 'dark' : 'light'),
        { backgroundColor, borderColor: palette.border, padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth },
});
