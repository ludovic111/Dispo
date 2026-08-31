import { Stack } from 'expo-router';

import { NotificationsScreen } from '@/features/settings/notifications-screen';

export default function NotificationsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <NotificationsScreen />
    </>
  );
}
