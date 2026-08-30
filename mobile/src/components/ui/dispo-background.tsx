import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';

export function DispoBackground({ children }: PropsWithChildren) {
  const { dark, palette } = useDispoTheme();
  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <LinearGradient
        colors={
          dark
            ? ['rgba(0,210,255,0.18)', 'rgba(0,153,255,0)']
            : ['rgba(0,153,255,0.12)', 'rgba(0,153,255,0)']
        }
        pointerEvents="none"
        style={styles.topHalo}
      />
      <LinearGradient
        colors={
          dark
            ? ['rgba(14,24,53,0)', 'rgba(0,153,255,0.11)']
            : ['rgba(240,244,255,0)', 'rgba(0,153,255,0.08)']
        }
        pointerEvents="none"
        style={styles.bottomHalo}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  topHalo: {
    height: 300,
    left: -90,
    position: 'absolute',
    right: -70,
    top: -180,
    transform: [{ rotate: '-8deg' }],
  },
  bottomHalo: { bottom: -100, height: 360, left: -60, position: 'absolute', right: -80 },
});
