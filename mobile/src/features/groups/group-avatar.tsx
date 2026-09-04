import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';

export function GroupAvatar({
  emoji,
  name,
  photoUrl,
  size = 50,
}: {
  emoji: string;
  name: string;
  photoUrl: string | null;
  size?: number;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (photoUrl) {
    return (
      <Image
        accessibilityLabel={t('Photo de {{name}}', { name })}
        contentFit="cover"
        source={{ uri: photoUrl }}
        style={{ borderRadius: size / 2, height: size, width: size }}
        transition={180}
      />
    );
  }
  return (
    <View
      accessibilityLabel={t('Groupe {{name}}', { name })}
      style={[
        styles.fallback,
        {
          backgroundColor: `${palette.bronze}26`,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <AppText maxFontSizeMultiplier={1} style={{ fontSize: size * 0.42, lineHeight: size * 0.6 }}>
        {emoji || '🎶'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ fallback: { alignItems: 'center', justifyContent: 'center' } });
