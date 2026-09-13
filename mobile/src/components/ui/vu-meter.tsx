import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { insetStyle, radii, spacing, tint } from '@/theme/tokens';

interface VuMeterProps {
  accessibilityLabel: string;
  /** Étiquette mono à gauche du rail (« Match », « Niveau »). */
  label?: string | undefined;
  /** Nombre de segments (défaut : 12). */
  segments?: number | undefined;
  /** `compact` : rail de 8 pt pour les lignes de liste · `regular` : 12 pt. */
  size?: 'regular' | 'compact' | undefined;
  /** `level` : vert → ambre → rouge comme un VU-mètre · `accent` : accent du thème seul. */
  tone?: 'level' | 'accent' | undefined;
  /** Valeur 0–1. */
  value: number;
}

/**
 * VU-mètre : rail en creux et segments « LED » allumés jusqu'à la valeur.
 * Signature musicale de Dispo pour les scores de compatibilité et les
 * progressions ; pas de jauge continue ailleurs.
 */
export function VuMeter({
  accessibilityLabel,
  label,
  segments = 12,
  size = 'regular',
  tone = 'level',
  value,
}: VuMeterProps) {
  const { palette } = useDispoTheme();
  const count = Math.max(1, Math.round(segments));
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const lit = Math.round(clamped * count);
  const segmentHeight = size === 'compact' ? 8 : 12;
  return (
    <View style={styles.row}>
      {label ? (
        <AppText color={palette.bronze} numberOfLines={1} variant="label">
          {label}
        </AppText>
      ) : null}
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: 100, min: 0, now: Math.round(clamped * 100) }}
        style={[styles.rail, insetStyle(palette)]}
      >
        {Array.from({ length: count }, (_, index) => {
          const ratio = (index + 1) / count;
          const color =
            tone === 'accent'
              ? palette.accent
              : ratio <= 0.6
                ? palette.jam
                : ratio <= 0.85
                  ? palette.warning
                  : palette.signal;
          const on = index < lit;
          return (
            <View
              key={index}
              style={[
                styles.segment,
                { backgroundColor: on ? color : tint(color, 0.16), height: segmentHeight },
                on && { borderColor: tint(color, 0.6) },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRadius: radii.xs,
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    padding: spacing.xxs,
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  segment: { borderColor: 'transparent', borderRadius: 2, borderTopWidth: 1, flex: 1 },
});
