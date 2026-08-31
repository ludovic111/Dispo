import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';

export function BrandLogo({
  markSize = 30,
  showWordmark = true,
  wordmarkColor,
}: {
  markSize?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <View accessibilityLabel="Dispo" style={styles.row}>
      <Image
        accessibilityIgnoresInvertColors
        contentFit="contain"
        source={require('../../../assets/images/dispo/logo-mark.png')}
        style={{ borderRadius: markSize * 0.235, height: markSize, width: markSize }}
      />
      {showWordmark ? (
        <AppText
          color={wordmarkColor ?? palette.text}
          style={{ fontSize: markSize * 0.72, lineHeight: markSize * 0.9 }}
          variant="displayItalic"
        >
          dispo
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { alignItems: 'center', flexDirection: 'row', gap: 8 } });
