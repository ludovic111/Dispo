import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui/screen';
import { ProfileVideoPlayer } from '@/features/media/profile-video';

export default function ProfileVideoScreen() {
  const { t } = useTranslation();
  const { title, url } = useLocalSearchParams<{ id: string; title?: string; url?: string }>();
  return (
    <Screen nativeHeader>
      <Stack.Screen options={{ presentation: 'modal', title: title || t('Vidéo') }} />
      <View style={styles.root}>
        {url?.startsWith('https://') ? (
          <ProfileVideoPlayer url={url} />
        ) : (
          <EmptyState
            icon="videocam-off-outline"
            message={t("Le lien de cette vidéo n'est pas disponible.")}
            title={t('Vidéo indisponible')}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
