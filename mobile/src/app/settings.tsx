import { Stack } from 'expo-router';

import { SettingsScreen } from '@/features/settings/settings-screen';

export default function SettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <SettingsScreen />
    </>
  );
}
