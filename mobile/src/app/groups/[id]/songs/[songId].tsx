import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupSongScreen } from '@/features/groups/group-song-screen';

export default function GroupSongRoute() {
  const { id, songId, sourceEventId } = useLocalSearchParams<{
    id: string;
    songId: string;
    sourceEventId?: string;
  }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Morceau') }} />
      <GroupSongScreen
        groupId={id ?? ''}
        songId={songId ?? ''}
        sourceEventId={sourceEventId || null}
      />
    </>
  );
}
