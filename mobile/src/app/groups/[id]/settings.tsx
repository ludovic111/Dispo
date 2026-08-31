import { Stack, useLocalSearchParams } from 'expo-router';

import { GroupSettingsScreen } from '@/features/groups/group-settings-screen';

export default function GroupSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GroupSettingsScreen groupId={id ?? ''} />
    </>
  );
}
