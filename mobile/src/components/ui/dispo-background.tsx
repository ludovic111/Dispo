import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useDispoTheme } from '@/theme/theme-context';

/**
 * Fond d'écran : la couleur de fond et une seule lueur bleu jazz en haut à
 * droite. Assez pour signer la marque, pas assez pour concurrencer le contenu.
 */
export function DispoBackground({ children }: PropsWithChildren) {
  const { dark, palette } = useDispoTheme();
  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.background}>
        <Defs>
          <RadialGradient cx="92%" cy="0%" id="dispoHalo" r="70%">
            <Stop offset="0" stopColor={palette.jazzGlow} stopOpacity={dark ? '0.18' : '0.22'} />
            <Stop offset="1" stopColor={palette.background} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#dispoHalo)" height="100%" width="100%" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  background: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  root: { flex: 1, overflow: 'hidden' },
});
