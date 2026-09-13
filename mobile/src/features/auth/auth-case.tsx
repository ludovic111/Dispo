import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card } from '@/components/ui/card';
import { GrainOverlay } from '@/components/ui/dispo-background';
import { radii, spacing } from '@/theme/tokens';

/**
 * « Étui » des écrans d'entrée (connexion, mot de passe, porte de compte) :
 * une carte relevée dont la surface porte le même grain que le papier de
 * fond, comme un étui d'instrument posé sur la scène. Le grain est découpé au
 * rayon de la carte pour ne pas déborder sur son ombre.
 */
export function AuthCase({
  children,
  padding = spacing.gutter,
  style,
}: PropsWithChildren<{ padding?: number; style?: StyleProp<ViewStyle> }>) {
  return (
    <Card padding={padding} style={[styles.case, style]} tone="elevated">
      <View pointerEvents="none" style={styles.grainClip}>
        <GrainOverlay />
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  case: { gap: spacing.md, width: '100%' },
  grainClip: {
    borderRadius: radii.card - 1,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
