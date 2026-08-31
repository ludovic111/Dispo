import { Stack } from 'expo-router';

import { FilterScreen } from '@/features/discovery/filter-screen';

export default function FiltersRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <FilterScreen />
    </>
  );
}
