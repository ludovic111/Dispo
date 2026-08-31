import { Stack } from 'expo-router';

import { AccountScreen } from '@/features/settings/account-screen';

export default function AccountRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <AccountScreen />
    </>
  );
}
