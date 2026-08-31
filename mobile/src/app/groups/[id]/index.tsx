import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupDetailScreen } from '@/features/groups/group-detail-screen';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupDetailScreen groupId={id ?? ''} />
    </>
  );
}
