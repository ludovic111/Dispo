import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupSongScreen } from '@/features/groups/group-song-screen';

export default function GroupSongRoute() {
  const { id, songId } = useLocalSearchParams<{ id: string; songId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupSongScreen groupId={id ?? ''} songId={songId ?? ''} />
    </>
  );
}
