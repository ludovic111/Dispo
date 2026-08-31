import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText } from './app-text';

interface AvatarProps {
  name: string;
  size?: number;
  uri?: string | null;
}

export function Avatar({ name, size = 56, uri }: AvatarProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  if (isAllowedAvatarUri(uri) && failedUri !== uri) {
    return (
      <Image
        contentFit="cover"
        onError={() => setFailedUri(uri)}
        source={{ uri }}
        style={{ borderRadius: size / 2, height: size, width: size }}
        transition={180}
      />
    );
  }

  const colors = avatarGradient(name);

  return (
    <LinearGradient
      colors={colors}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.fallback,
        {
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <AppText color="#FFFFFF" style={{ fontSize: size * 0.38, fontWeight: '800' }}>
        {initials || 'D'}
      </AppText>
    </LinearGradient>
  );
}

const avatarGradients = [
  ['#00D2FF', '#0099FF'],
  ['#0099FF', '#2A3A66'],
  ['#00D2FF', '#0E1835'],
  ['#8E9AAF', '#0A1128'],
] as const;

function stableHash(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}

function avatarGradient(name: string): (typeof avatarGradients)[number] {
  return avatarGradients[stableHash(name) % avatarGradients.length] ?? avatarGradients[0];
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
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
