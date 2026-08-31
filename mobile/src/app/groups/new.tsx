import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupNewScreen } from '@/features/groups/group-new-screen';

export default function NewGroupRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Nouveau groupe') }} />
      <GroupNewScreen />
    </>
  );
}
