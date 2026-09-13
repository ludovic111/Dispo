import type { PropsWithChildren } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useDispoTheme } from '@/theme/theme-context';

const grain = {
  dark: require('../../../assets/images/textures/grain-dark.png'),
  light: require('../../../assets/images/textures/grain-light.png'),
} as const;

/**
 * Grain de papier répété à faible opacité : la texture porte uniquement de
 * l'alpha, elle prend donc la couleur du fond de n'importe quel thème.
 * Posé par `DispoBackground` et `BottomSheet`.
 */
export function GrainOverlay({ opacity }: { opacity?: number | undefined }) {
  const { dark } = useDispoTheme();
  return (
    <Image
      accessibilityIgnoresInvertColors
      importantForAccessibility="no"
      resizeMode="repeat"
      source={dark ? grain.dark : grain.light}
      style={[styles.grain, { opacity: opacity ?? (dark ? 0.7 : 0.55) }]}
    />
  );
}

/**
 * Fond d'écran : la couleur de fond du thème, un grain de papier discret et
 * une seule lueur accent en haut à droite. Assez pour signer la marque, pas
 * assez pour concurrencer le contenu.
 */
export function DispoBackground({ children }: PropsWithChildren) {
  const { dark, palette } = useDispoTheme();
  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <GrainOverlay />
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
  grain: {
    bottom: 0,
    height: undefined,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
    width: undefined,
  },
  root: { flex: 1, overflow: 'hidden' },
});
