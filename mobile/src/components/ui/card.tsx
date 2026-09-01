import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { cardShadow, radii, spacing } from '@/theme/tokens';

interface CardProps extends ViewProps {
  padding?: number;
  tone?: 'default' | 'elevated' | 'inset';
}

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
    <View style={[styles.shadow, cardShadow(dark ? 'dark' : 'light')]}>
      <View
        {...props}
        style={[styles.card, { backgroundColor, borderColor: palette.border, padding }, style]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.highlight,
            { borderColor: dark ? `${palette.jazzGlow}1A` : 'rgba(255,255,255,0.84)' },
          ]}
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, overflow: 'hidden' },
  highlight: {
    borderRadius: radii.card - 1,
    borderTopWidth: 1,
    height: '50%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  shadow: { alignSelf: 'stretch', borderRadius: radii.card },
});
