import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupListScreen } from '@/features/groups/group-list-screen';

export default function GroupsRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Groupes') }} />
      <GroupListScreen />
    </>
  );
}
