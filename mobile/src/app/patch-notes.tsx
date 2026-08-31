import { Stack } from 'expo-router';

import { PatchNotesScreen } from '@/features/settings/patch-notes-screen';

export default function PatchNotesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <PatchNotesScreen />
    </>
  );
}
