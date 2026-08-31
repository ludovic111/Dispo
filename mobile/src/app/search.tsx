import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SearchScreen } from '@/features/discovery/search-screen';

export default function SearchRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('Recherche') }} />
      <SearchScreen />
    </>
  );
}
