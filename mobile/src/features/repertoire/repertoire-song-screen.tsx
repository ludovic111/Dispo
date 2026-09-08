import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { masteryLabels, personalSongStyle, repertoireStyles } from './repertoire-model';
import { usePersonalRepertoire, usePersonalRepertoireActions } from './repertoire-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { directStreamingDestinations, irealDestination } from '@/domain/song';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';

export function RepertoireSongScreen({ profileId, songId }: { profileId: string; songId: string }) {
  const { session } = useAuth();
  const self = session?.user.id === profileId;
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = usePersonalRepertoire(profileId);
  const { update } = usePersonalRepertoireActions();
  const item = query.data?.songs.find((song) => song.id === songId);
  if (query.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Le répertoire n’a pas pu être chargé.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  if (!item || (!self && !query.data?.isPublic))
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Ce morceau n’est plus accessible.')} />
      </Screen>
    );
  const fail = () => Alert.alert(t('La modification n’a pas pu être enregistrée.'));
  const ireal = irealDestination(item.song);
  const open = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert(t('Ce lien n’a pas pu être ouvert.')));
  };
  const remove = () =>
    Alert.alert(
      t('Retirer ce morceau ?'),
      t('Il ne sera plus ajouté automatiquement. Tu pourras le rajouter manuellement.'),
      [
        { text: t('Annuler'), style: 'cancel' },
        {
          text: t('Retirer'),
          style: 'destructive',
          onPress: () =>
            update.mutate(
              { id: item.id, hidden: true },
              { onError: fail, onSuccess: () => router.back() },
            ),
        },
      ],
    );
  return (
    <Screen nativeHeader>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.section}>
          <AppText variant="title2">{item.song.title}</AppText>
          {item.song.artist ? <AppText color={palette.muted}>{item.song.artist}</AppText> : null}
          <AppText color={palette.bronze} variant="caption">
            {[personalSongStyle(item) && t(personalSongStyle(item)), item.song.key]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          {self ? (
            <AppText color={palette.muted} variant="caption">
              {t(item.origin === 'group' ? 'Ajouté depuis tes groupes' : 'Ajouté par toi')}
            </AppText>
          ) : null}
        </Card>
        <Card style={styles.section}>
          <AppText variant="headline">{t(self ? 'Ma maîtrise' : 'Maîtrise')}</AppText>
          {self ? (
            <View style={styles.chips}>
              {masteryLabels.map((label, mastery) => (
                <ChoiceChip
                  key={label}
                  label={t(label)}
                  selected={item.mastery === mastery}
                  onPress={() => {
                    if (!update.isPending)
                      update.mutate({ id: item.id, mastery }, { onError: fail });
                  }}
                />
              ))}
            </View>
          ) : (
            <AppText color={palette.muted}>
              {t(masteryLabels[item.mastery] ?? masteryLabels[0])}
            </AppText>
          )}
        </Card>
        {self ? (
          <Card style={styles.section}>
            <AppText variant="headline">{t('Style')}</AppText>
            <View style={styles.chips}>
              {repertoireStyles.map((style) => (
                <ChoiceChip
                  key={style}
                  label={t(style)}
                  selected={personalSongStyle(item) === style}
                  onPress={() => {
                    if (!update.isPending) update.mutate({ id: item.id, style }, { onError: fail });
                  }}
                />
              ))}
            </View>
            <AppText color={palette.muted} variant="caption">
              {t('Ce classement ne modifie pas les morceaux de tes groupes.')}
            </AppText>
          </Card>
        ) : null}
        {directStreamingDestinations(item.song).map((link) => (
          <DispoButton
            key={
              {
                appleMusic: 'Apple Music',
                spotify: 'Spotify',
                youtubeMusic: 'YouTube Music',
                deezer: 'Deezer',
                tidal: 'TIDAL',
                amazonMusic: 'Amazon Music',
              }[link.platform]
            }
            variant="secondary"
            icon="play-outline"
            onPress={() => open(link.url)}
          >
            {
              {
                appleMusic: 'Apple Music',
                spotify: 'Spotify',
                youtubeMusic: 'YouTube Music',
                deezer: 'Deezer',
                tidal: 'TIDAL',
                amazonMusic: 'Amazon Music',
              }[link.platform]
            }
          </DispoButton>
        ))}
        {ireal ? (
          <DispoButton variant="secondary" icon="musical-notes" onPress={() => open(ireal.url)}>
            iReal Pro
          </DispoButton>
        ) : null}
        {self && item.origin === 'manual' ? (
          <DispoButton
            icon="copy-outline"
            onPress={() => router.push(`/repertoire/songs/${songId}/copy` as never)}
          >
            {t('Copier vers un groupe ou événement')}
          </DispoButton>
        ) : null}
        {self ? (
          <DispoButton
            variant="danger"
            disabled={update.isPending}
            icon="trash-outline"
            onPress={remove}
          >
            {t('Retirer de mon répertoire')}
          </DispoButton>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40, gap: 16 },
  section: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
