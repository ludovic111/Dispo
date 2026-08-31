import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NotificationsCenterScreen } from '@/features/notifications/notifications-center-screen';

export default function NotificationCenterRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, presentation: 'modal', title: t('Notifications') }}
      />
      <NotificationsCenterScreen />
    </>
  );
}
