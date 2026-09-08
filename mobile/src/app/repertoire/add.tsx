import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RepertoireAddScreen } from '@/features/repertoire/repertoire-add-screen';
export default function AddRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('Ajouter un morceau') }} />
      <RepertoireAddScreen />
    </>
  );
}
