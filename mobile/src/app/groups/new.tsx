import { Stack } from 'expo-router';

import { GroupNewScreen } from '@/features/groups/group-new-screen';

export default function NewGroupRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupNewScreen />
    </>
  );
}
