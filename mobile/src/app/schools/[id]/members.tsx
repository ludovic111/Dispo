import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SchoolMembersScreen } from '@/features/schools/school-members-screen';
import { useMySchoolAffiliations } from '@/features/schools/school-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';

export default function SchoolMembersRoute() {
  const { t } = useTranslation();
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const mine = useMySchoolAffiliations();
  const count = mine.data?.find((item) => item.school.id === id)?.memberCount;
  return (
    <>
      <Stack.Screen
        options={{
          title:
            count === undefined ? t('Membres') : formatSwiftPlaceholders(t('%lld membres'), count),
        }}
      />
      <SchoolMembersScreen schoolId={id} />
    </>
  );
}
