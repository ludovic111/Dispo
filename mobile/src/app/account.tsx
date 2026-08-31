import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { AccountScreen } from '@/features/settings/account-screen';

export default function AccountRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <NativeHeaderButton label={t('OK')} onPress={() => router.back()} />,
          headerShown: true,
          presentation: 'modal',
          title: t('Mon compte'),
        }}
      />
      <AccountScreen />
    </>
  );
}
