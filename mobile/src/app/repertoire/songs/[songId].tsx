import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RepertoireSongScreen } from '@/features/repertoire/repertoire-song-screen';
export default function SongRoute() {
  const { songId, profileId } = useLocalSearchParams<{ songId: string; profileId: string }>();
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('Morceau') }} />
      <RepertoireSongScreen songId={songId ?? ''} profileId={profileId ?? ''} />
    </>
  );
}
