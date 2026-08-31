import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { FilterScreen } from '@/features/discovery/filter-screen';
import { filterPresentationOptions } from '@/features/navigation/stack-header-policy';

export default function FiltersRoute() {
  return (
    <>
      <Stack.Screen options={filterPresentationOptions(Platform.OS)} />
      <FilterScreen />
    </>
  );
}
