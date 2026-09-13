import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, tint } from '@/theme/tokens';

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
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (photoUrl && failedUri !== photoUrl) {
    return (
      <Image
        accessibilityLabel={t('Photo de {{name}}', { name })}
        contentFit="cover"
        onError={() => setFailedUri(photoUrl)}
        recyclingKey={photoUrl}
        source={{ uri: photoUrl }}
        style={{ borderRadius: radii.round, height: size, width: size }}
        transition={180}
      />
    );
  }
  return (
    <View
      accessibilityLabel={t('Groupe {{name}}', { name })}
      style={[
        styles.fallback,
        { backgroundColor: tint(palette.bronze, 0.15), height: size, width: size },
      ]}
    >
      <AppText
        maxFontSizeMultiplier={1}
        variant={size >= 60 ? 'display' : size >= 46 ? 'title2' : 'body'}
      >
        {emoji || '🎶'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', borderRadius: radii.round, justifyContent: 'center' },
});
