import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupSongCopyScreen } from '@/features/groups/group-song-copy-screen';

export default function GroupSongCopyRoute() {
  const { id, songId, sourceEventId } = useLocalSearchParams<{
    id: string;
    songId: string;
    sourceEventId?: string;
  }>();
  return (
    <>
      <Stack.Screen
        options={{ gestureEnabled: false, headerShown: false, presentation: 'modal' }}
      />
      <GroupSongCopyScreen
        songId={songId ?? ''}
        sourceEventId={sourceEventId || null}
        sourceGroupId={id ?? ''}
      />
    </>
  );
}
