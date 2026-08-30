import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

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
    <View
      {...props}
      style={[
        styles.card,
        cardShadow(dark ? 'dark' : 'light'),
        { backgroundColor: palette.card, borderColor: palette.border, padding },
        Platform.OS === 'android' && styles.android,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  android: { overflow: 'hidden' },
  card: { borderRadius: radii.card, borderWidth: 1 },
});
