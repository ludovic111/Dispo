import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SchoolDirectoryScreen } from '@/features/schools/school-directory-screen';

export default function SchoolsRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('Écoles de musique') }} />
      <SchoolDirectoryScreen />
    </>
  );
}
