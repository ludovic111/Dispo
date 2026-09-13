import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/pressable';
import { EmptyState } from '@/components/ui/screen';
import { ProfileVideoPlayer } from '@/features/media/profile-video';
import { isPlayableProfileVideoUrl } from '@/features/media/profile-video-url';
import { onAccent, spacing } from '@/theme/tokens';

/** Fond du lecteur plein écran : noir vidéo, identique dans les deux thèmes. */
const playerBackground = '#000000';

export default function ProfileVideoScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { title, url } = useLocalSearchParams<{ id: string; title?: string; url?: string }>();
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          title: title || t('Vidéo'),
        }}
      />
      {isPlayableProfileVideoUrl(url) ? (
        <ProfileVideoPlayer url={url} />
      ) : (
        <View style={styles.empty}>
          <EmptyState
            icon="videocam-off-outline"
            message={t("Le lien de cette vidéo n'est pas disponible.")}
            title={t('Vidéo indisponible')}
          />
        </View>
      )}
      <View style={[styles.close, { top: Math.max(insets.top, spacing.sm) + spacing.xxs }]}>
        <IconButton
          accessibilityLabel={t('Fermer')}
          icon="close-circle"
          iconColor={onAccent}
          onPress={() => router.back()}
          variant="plain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', right: spacing.md },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  root: { backgroundColor: playerBackground, flex: 1 },
});
