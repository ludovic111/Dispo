import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { cardShadow, radii, spacing } from '@/theme/tokens';

interface CardProps extends ViewProps {
  padding?: number;
}

export function Card({
  children,
  padding = spacing.md,
  style,
  ...props
}: PropsWithChildren<CardProps>) {
  const { dark, palette } = useDispoTheme();
  return (
    <View style={[styles.shadow, cardShadow(dark ? 'dark' : 'light')]}>
      <View
        {...props}
        style={[
          styles.card,
          { backgroundColor: palette.card, borderColor: palette.border, padding },
          style,
        ]}
      >
        <View pointerEvents="none" style={styles.highlight} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, overflow: 'hidden' },
  highlight: {
    borderColor: 'rgba(255,255,255,0.09)',
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
