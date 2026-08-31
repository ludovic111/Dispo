import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SchoolDetailScreen } from '@/features/schools/school-detail-screen';
import { schoolDisplayName } from '@/features/schools/school-model';
import { useSchool } from '@/features/schools/school-queries';

export default function SchoolDetailRoute() {
  const { t } = useTranslation();
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const school = useSchool(id);
  return (
    <>
      <Stack.Screen
        options={{ title: school.data ? schoolDisplayName(school.data) : t('École') }}
      />
      <SchoolDetailScreen schoolId={id} />
    </>
  );
}
