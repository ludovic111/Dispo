import { Stack } from 'expo-router';

import { OnboardingScreen } from '@/features/onboarding/onboarding-screen';

export default function OnboardingRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OnboardingScreen />
    </>
  );
}
