import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useDispoTheme } from '@/theme/theme-context';

export function DispoBackground({ children }: PropsWithChildren) {
  const { dark, palette } = useDispoTheme();
  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.background}>
        <Defs>
          <RadialGradient cx="94%" cy="2%" id="topHalo" r="58%">
            <Stop offset="0" stopColor={dark ? '#00D2FF' : '#0099FF'} stopOpacity="0.17" />
            <Stop offset="1" stopColor={palette.background} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="4%" cy="96%" id="bottomHalo" r="55%">
            <Stop offset="0" stopColor={dark ? '#16203D' : '#CBD5E1'} stopOpacity="0.38" />
            <Stop offset="1" stopColor={palette.background} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="50%" cy="50%" id="vignette" r="74%">
            <Stop offset="0" stopColor={palette.background} stopOpacity="0" />
            <Stop offset="1" stopColor={palette.background} stopOpacity="0.45" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#topHalo)" height="100%" width="100%" />
        <Rect fill="url(#bottomHalo)" height="100%" width="100%" />
        <Rect fill="url(#vignette)" height="100%" width="100%" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  background: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  root: { flex: 1, overflow: 'hidden' },
});
