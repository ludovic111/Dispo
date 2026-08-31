import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/screen';
import { ProfileVideoPlayer } from '@/features/media/profile-video';

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
      {url?.startsWith('https://') ? (
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
      <Pressable
        accessibilityLabel={t('Fermer')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.close,
          { top: Math.max(insets.top, 12) + 4 },
          pressed && styles.closePressed,
        ]}
      >
        <Ionicons color="#FFFFFF" name="close-circle" size={34} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  close: {
    position: 'absolute',
    right: 16,
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
  },
  closePressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  root: { backgroundColor: '#000000', flex: 1 },
});
