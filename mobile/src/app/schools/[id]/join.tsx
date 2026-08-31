import { Stack, useLocalSearchParams } from 'expo-router';

import { SchoolAffiliationScreen } from '@/features/schools/school-affiliation-screen';

export default function SchoolJoinRoute() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <SchoolAffiliationScreen schoolId={id} />
    </>
  );
}
