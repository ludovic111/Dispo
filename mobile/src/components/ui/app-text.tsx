import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { typography } from '@/theme/tokens';

type TextVariant =
  | 'body'
  | 'callout'
  | 'caption'
  | 'caption2'
  | 'display'
  | 'displayItalic'
  | 'headline'
  | 'label'
  | 'secondary'
  | 'subheadline'
  | 'title'
  | 'title2'
  | 'title3';

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
  base: { fontFamily: typography.body, fontSize: 16 },
  body: { fontSize: 17, lineHeight: 23 },
  callout: { fontSize: 16, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 14 },
  display: { fontFamily: typography.display, fontSize: 30, lineHeight: 34 },
  displayItalic: { fontFamily: typography.displayItalic, fontSize: 30, lineHeight: 34 },
  headline: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  label: {
    fontFamily: typography.monoSemibold,
    fontSize: 11,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  secondary: { fontSize: 15, lineHeight: 20 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 22 },
  title2: { fontFamily: typography.display, fontSize: 22, lineHeight: 27 },
  title3: { fontFamily: typography.display, fontSize: 20, lineHeight: 25 },
});
