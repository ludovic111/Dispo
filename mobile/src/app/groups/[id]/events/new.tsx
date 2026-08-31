import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupEventNewScreen } from '@/features/groups/group-event-new-screen';

export default function NewGroupEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupEventNewScreen groupId={id ?? ''} />
    </>
  );
}
