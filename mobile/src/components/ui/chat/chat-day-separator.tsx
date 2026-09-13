import { StyleSheet, View } from 'react-native';

import { AppText } from '../app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

/** Séparateur de journée d'un fil de conversation : ligne, pastille de date, ligne. */
export function ChatDaySeparator({ label }: { label: string }) {
  const { palette } = useDispoTheme();
  return (
    <View accessibilityRole="header" style={styles.row}>
      <View style={[styles.line, { backgroundColor: palette.border }]} />
      <View style={[styles.pill, { backgroundColor: palette.cardMuted }]}>
        <AppText color={palette.muted} variant="caption2" weight="semibold">
          {label}
        </AppText>
      </View>
      <View style={[styles.line, { backgroundColor: palette.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  pill: {
    borderRadius: radii.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
    width: '100%',
  },
});
