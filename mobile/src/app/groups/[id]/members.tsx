import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupMembersScreen } from '@/features/groups/group-members-screen';

export default function GroupMembersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupMembersScreen groupId={id ?? ''} />
    </>
  );
}
