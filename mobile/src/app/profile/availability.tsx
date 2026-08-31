import { Stack } from 'expo-router';

import { ProfileAvailabilityScreen } from '@/features/profiles/profile-availability-screen';

export default function ProfileAvailabilityRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <ProfileAvailabilityScreen />
    </>
  );
}
