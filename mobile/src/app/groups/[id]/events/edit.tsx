import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupEventEditScreen } from '@/features/groups/group-event-edit-screen';

export default function EditGroupEventRoute() {
  const { eventId, id } = useLocalSearchParams<{ eventId: string; id: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Modifier la session') }} />
      <GroupEventEditScreen eventId={eventId ?? ''} groupId={id ?? ''} />
    </>
  );
}
