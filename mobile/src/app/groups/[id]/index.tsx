import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupDetailScreen } from '@/features/groups/group-detail-screen';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Groupe') }} />
      <GroupDetailScreen groupId={id ?? ''} />
    </>
  );
}
