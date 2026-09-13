import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { onAccent, radii, spacing } from '@/theme/tokens';

/**
 * Compteur de non-lus / d'éléments à traiter. Une seule forme dans l'app :
 * pastille ronde, fond accent, chiffre en mono.
 */
export function CountBadge({
  count,
  tone = 'accent',
}: {
  count: number;
  /** `accent` : bleu jazz (non-lus) · `signal` : orange (à traiter d'urgence). */
  tone?: 'accent' | 'signal';
}) {
  const { palette } = useDispoTheme();
  if (count <= 0) return null;
  const background = tone === 'signal' ? palette.signal : palette.accent;
  const foreground = tone === 'signal' ? onAccent : palette.accentInk;
  return (
    <View
      accessibilityLabel={String(count)}
      style={[
        styles.badge,
        {
          backgroundColor: background,
          borderColor: tone === 'signal' ? palette.error : palette.accentDeep,
        },
      ]}
    >
      <AppText color={foreground} style={styles.text} variant="caption2" weight="bold">
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}

/** Point de non-lu sans chiffre (notification, ligne de liste). */
export function UnreadDot({ color }: { color?: string }) {
  const { palette } = useDispoTheme();
  return <View style={[styles.dot, { backgroundColor: color ?? palette.electric }]} />;
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 22,
    paddingHorizontal: spacing.tight,
  },
  dot: { borderRadius: radii.round, height: 8, width: 8 },
  text: { lineHeight: 14 },
});
