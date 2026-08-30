import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';

interface AvatarProps {
  name: string;
  size?: number;
  uri?: string | null;
}

export function Avatar({ name, size = 56, uri }: AvatarProps) {
  const { palette } = useDispoTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  if (uri) {
    return (
      <Image
        contentFit="cover"
        source={{ uri }}
        style={{ borderRadius: size / 2, height: size, width: size }}
        transition={180}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          backgroundColor: palette.inset,
          borderColor: palette.border,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <AppText color={palette.electric} style={{ fontSize: size * 0.31, fontWeight: '800' }}>
        {initials || 'D'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
});
