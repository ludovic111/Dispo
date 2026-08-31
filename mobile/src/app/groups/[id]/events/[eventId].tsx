import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupEventDetailScreen } from '@/features/groups/group-event-detail-screen';

export default function GroupEventRoute() {
  const { eventId, id } = useLocalSearchParams<{ eventId: string; id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupEventDetailScreen eventId={eventId ?? ''} groupId={id ?? ''} />
    </>
  );
}
