import { Stack } from 'expo-router';

import { NotificationsCenterScreen } from '@/features/notifications/notifications-center-screen';

export default function NotificationCenterRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <NotificationsCenterScreen />
    </>
  );
}
