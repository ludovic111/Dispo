import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { GroupSongCopyScreen } from '@/features/groups/group-song-copy-screen';

export default function GroupSongCopyRoute() {
  const { id, songId, sourceEventId } = useLocalSearchParams<{
    id: string;
    songId: string;
    sourceEventId?: string;
  }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerLeft: () => (
            <NativeHeaderButton label={t('Fermer')} onPress={() => router.back()} />
          ),
          headerShown: true,
          presentation: 'modal',
          title: t('Copier le morceau'),
        }}
      />
      <GroupSongCopyScreen
        songId={songId ?? ''}
        sourceEventId={sourceEventId || null}
        sourceGroupId={id ?? ''}
      />
    </>
  );
}
