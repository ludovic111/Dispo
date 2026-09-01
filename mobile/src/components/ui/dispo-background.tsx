import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useDispoTheme } from '@/theme/theme-context';

export function DispoBackground({ children }: PropsWithChildren) {
  const { dark, palette } = useDispoTheme();
  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.background}>
        <Defs>
          <RadialGradient cx="94%" cy="2%" id="topHalo" r="58%">
            <Stop offset="0" stopColor={palette.jazzGlow} stopOpacity={dark ? '0.20' : '0.16'} />
            <Stop offset="1" stopColor={palette.background} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="4%" cy="96%" id="bottomHalo" r="55%">
            <Stop offset="0" stopColor={palette.jazzDeep} stopOpacity={dark ? '0.34' : '0.12'} />
            <Stop offset="1" stopColor={palette.background} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="stageWash" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor={palette.background} stopOpacity="0" />
            <Stop offset="0.62" stopColor={palette.jazzDeep} stopOpacity={dark ? '0.09' : '0.04'} />
            <Stop offset="1" stopColor={palette.electric} stopOpacity={dark ? '0.07' : '0.03'} />
          </LinearGradient>
          <RadialGradient cx="50%" cy="50%" id="vignette" r="74%">
            <Stop offset="0" stopColor={palette.background} stopOpacity="0" />
            <Stop offset="1" stopColor={palette.background} stopOpacity="0.45" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#topHalo)" height="100%" width="100%" />
        <Rect fill="url(#bottomHalo)" height="100%" width="100%" />
        <Rect fill="url(#stageWash)" height="100%" width="100%" />
        <Ellipse
          cx="96%"
          cy="3%"
          fill="none"
          rx="39%"
          ry="17%"
          stroke={palette.electric}
          strokeOpacity={dark ? '0.055' : '0.04'}
          strokeWidth="1"
        />
        <Ellipse
          cx="96%"
          cy="3%"
          fill="none"
          rx="48%"
          ry="22%"
          stroke={palette.electric}
          strokeOpacity={dark ? '0.035' : '0.025'}
          strokeWidth="1"
        />
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
