import { Stack } from 'expo-router';

import { ProfileEditScreen } from '@/features/profiles/profile-edit-screen';

export default function ProfileEditRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <ProfileEditScreen />
    </>
  );
}
