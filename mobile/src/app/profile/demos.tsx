import { Stack } from 'expo-router';

import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';

export default function ProfileDemosRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <PortfolioScreen section="demos" />
    </>
  );
}
