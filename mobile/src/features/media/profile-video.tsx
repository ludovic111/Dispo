import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function ProfileVideoPlayer({ url }: { url: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useVideoPlayer({ uri: url }, (instance) => instance.play());

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ error: playerError, status }) => {
      if (status === 'error') setError(playerError?.message ?? t('Lecture impossible.'));
      if (status === 'readyToPlay') setReady(true);
    });
    return () => subscription.remove();
  }, [player, t]);

  return (
    <View style={[styles.root, { backgroundColor: '#000000' }]}>
      <VideoView
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        nativeControls
        player={player}
        style={styles.video}
      />
      {!ready && !error ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#FFFFFF" size="large" />
          <AppText color="#FFFFFF">{t('Chargement de la vidéo…')}</AppText>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.overlay, { backgroundColor: palette.background }]}>
          <Ionicons color={palette.signal} name="alert-circle-outline" size={38} />
          <AppText style={styles.center} variant="title">
            {t('Vidéo indisponible')}
          </AppText>
          <AppText color={palette.muted} style={styles.center}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  overlay: {
    alignItems: 'center',
    bottom: 0,
    gap: spacing.sm,
    justifyContent: 'center',
    left: 0,
    padding: spacing.xl,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  root: { flex: 1 },
  video: { flex: 1 },
});
