import { Stack } from 'expo-router';

import { GroupListScreen } from '@/features/groups/group-list-screen';

export default function GroupsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupListScreen />
    </>
  );
}
