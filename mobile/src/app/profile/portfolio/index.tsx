import { Stack } from 'expo-router';

import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';

export default function PortfolioRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PortfolioScreen />
    </>
  );
}
