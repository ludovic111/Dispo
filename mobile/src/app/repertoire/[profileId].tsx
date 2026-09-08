import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RepertoireScreen } from '@/features/repertoire/repertoire-screen';
export default function RepertoireRoute() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('Répertoire musical') }} />
      <RepertoireScreen profileId={profileId ?? ''} />
    </>
  );
}
