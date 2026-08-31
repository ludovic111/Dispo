import { Stack } from 'expo-router';

import { PremiumScreen } from '@/features/premium/premium-screen';

export default function PremiumRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <PremiumScreen />
    </>
  );
}
