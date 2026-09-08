import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, LoadingState, ErrorState } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GroupSongCopyScreen } from '@/features/groups/group-song-copy-screen';
import { usePersonalRepertoire } from '@/features/repertoire/repertoire-queries';
export default function CopyRoute() {
  const { songId } = useLocalSearchParams<{ songId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();
  const query = usePersonalRepertoire(session?.user.id ?? '');
  const item = query.data?.songs.find((value) => value.id === songId);
  return (
    <>
      <Stack.Screen options={{ title: t('Copier le morceau') }} />
      {query.isLoading ? (
        <Screen nativeHeader>
          <LoadingState />
        </Screen>
      ) : query.isError || !item || item.origin !== 'manual' ? (
        <Screen nativeHeader>
          <ErrorState
            message={t('Ce morceau n’est plus accessible.')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      ) : (
        <GroupSongCopyScreen
          personalSong={item.song}
          songId={songId ?? ''}
          sourceEventId={null}
          sourceGroupId=""
        />
      )}
    </>
  );
}
