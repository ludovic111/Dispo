import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { readableOn } from '@/theme/color';
import { useDispoTheme } from '@/theme/theme-context';
import { blend, onAccent, tint, type DispoPalette } from '@/theme/tokens';

interface AvatarProps {
  name: string;
  size?: number;
  uri?: string | null;
}

/**
 * Avatar : photo si elle est servie en HTTPS (ou depuis le réseau local),
 * sinon initiales sur un duotone dérivé de l'accent du thème. Trois nuances
 * du même duotone se répartissent entre les personnes selon leur nom : la
 * palette reste celle du thème, jamais un dégradé aléatoire.
 */
export function Avatar({ name, size = 56, uri }: AvatarProps) {
  const { palette } = useDispoTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  if (isAllowedAvatarUri(uri) && failedUri !== uri) {
    return (
      <View style={[styles.ring, { borderColor: palette.edge, borderRadius: size / 2 }]}>
        <Image
          contentFit="cover"
          onError={() => setFailedUri(uri)}
          source={{ uri }}
          style={{ borderRadius: size / 2, height: size, width: size }}
          transition={180}
        />
      </View>
    );
  }

  const colors = avatarDuotone(palette, name);
  const ink = readableOn(blend(colors[0], colors[1], 0.5), [palette.ink, palette.paper, onAccent]);

  return (
    <LinearGradient
      colors={colors}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.fallback,
        {
          borderColor: tint(onAccent, 0.22),
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <AppText
        color={ink}
        maxFontSizeMultiplier={1}
        numberOfLines={1}
        style={{ fontSize: size * 0.38, lineHeight: size * 0.48 }}
        variant="title2"
      >
        {initials || 'D'}
      </AppText>
    </LinearGradient>
  );
}

function stableHash(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}

/** Trois duotones du thème : accent profond → accent, nuit → accent profond, accent → accent doux. */
export function avatarDuotone(palette: DispoPalette, name: string): readonly [string, string] {
  const variants: readonly (readonly [string, string])[] = [
    [palette.accentDeep, palette.accent],
    [palette.jazzDeep, palette.accentDeep],
    [palette.accent, blend(palette.accent, palette.accentSoft, 0.55)],
  ];
  return variants[stableHash(name) % variants.length] ?? variants[0]!;
}

function isAllowedAvatarUri(uri: string | null | undefined): uri is string {
  if (!uri) return false;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
    if (/^(127\.|10\.|192\.168\.)/.test(host)) return true;
    const match = /^172\.(\d+)\./.exec(host);
    return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  ring: { borderWidth: StyleSheet.hairlineWidth },
});
