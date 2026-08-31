import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupEventEditScreen } from '@/features/groups/group-event-edit-screen';

export default function EditGroupEventRoute() {
  const { eventId, id } = useLocalSearchParams<{ eventId: string; id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupEventEditScreen eventId={eventId ?? ''} groupId={id ?? ''} />
    </>
  );
}
