import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { NotificationsScreen } from '@/features/settings/notifications-screen';

export default function NotificationsRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <NativeHeaderButton label={t('OK')} onPress={() => router.back()} />,
          headerShown: true,
          presentation: 'modal',
          title: t('Notifications'),
        }}
      />
      <NotificationsScreen />
    </>
  );
}
