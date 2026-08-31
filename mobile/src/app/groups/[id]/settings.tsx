import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GroupSettingsScreen } from '@/features/groups/group-settings-screen';

export default function GroupSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Réglages du groupe') }} />
      <GroupSettingsScreen groupId={id ?? ''} />
    </>
  );
}
