import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupEventNewScreen } from '@/features/groups/group-event-new-screen';

export default function NewGroupEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Créer un événement') }} />
      <GroupEventNewScreen groupId={id ?? ''} />
    </>
  );
}
