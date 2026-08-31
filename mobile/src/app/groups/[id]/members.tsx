import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupMembersScreen } from '@/features/groups/group-members-screen';

export default function GroupMembersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Membres') }} />
      <GroupMembersScreen groupId={id ?? ''} />
    </>
  );
}
