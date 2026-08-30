import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { typography } from '@/theme/tokens';

type TextVariant = 'body' | 'caption' | 'display' | 'displayItalic' | 'label' | 'title';

interface AppTextProps extends ComponentProps<typeof Text> {
  color?: string;
  variant?: TextVariant;
}

export function AppText({ color, style, variant = 'body', ...props }: AppTextProps) {
  const { palette } = useDispoTheme();
  return (
    <Text
      {...props}
      style={[styles.base, styles[variant], { color: color ?? palette.text }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 16 },
  body: { fontSize: 16, lineHeight: 23 },
  caption: { fontSize: 12, lineHeight: 16 },
  display: { fontFamily: typography.display, fontSize: 30, lineHeight: 34 },
  displayItalic: { fontFamily: typography.displayItalic, fontSize: 30, lineHeight: 34 },
  label: {
    fontFamily: typography.monoSemibold,
    fontSize: 11,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 22 },
});
