import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupEventDetailScreen } from '@/features/groups/group-event-detail-screen';

export default function GroupEventRoute() {
  const { eventId, id } = useLocalSearchParams<{ eventId: string; id: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Session') }} />
      <GroupEventDetailScreen eventId={eventId ?? ''} groupId={id ?? ''} />
    </>
  );
}
