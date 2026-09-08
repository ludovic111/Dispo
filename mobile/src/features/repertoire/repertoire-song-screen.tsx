import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import {
  masteryLabels,
  personalSongStyle,
  repertoireStyles,
  personalArrangementChanges,
} from './repertoire-model';
import { usePersonalRepertoire, usePersonalRepertoireActions } from './repertoire-queries';
import { savePersonalArrangement } from './repertoire-repository';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import type { GroupSong } from '@/features/groups/group-model';
import { SongInfoPanel } from '@/features/groups/song-info-panel';
import { usePremiumCapability } from '@/features/premium/subscription-queries';
import { useDispoTheme } from '@/theme/theme-context';

export function RepertoireSongScreen({ profileId, songId }: { profileId: string; songId: string }) {
  const { session } = useAuth();
  const self = session?.user.id === profileId;
  const premium = usePremiumCapability('personalRepertoire');
  const canEdit = self && premium;
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = usePersonalRepertoire(profileId);
  const client = useQueryClient();
  const [draft, setDraft] = useState<GroupSong | null>(null);
  const [original, setOriginal] = useState<GroupSong | null>(null);
  const save = useMutation({
    mutationFn: () =>
      savePersonalArrangement(songId, personalArrangementChanges(original!, draft!)),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['personal-repertoire'] });
      setDraft(null);
      setOriginal(null);
    },
    onError: () => Alert.alert(t('La modification n’a pas pu être enregistrée.')),
  });
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
  const song = draft ?? item.song;
  const changed =
    draft !== null &&
    original !== null &&
    Object.keys(personalArrangementChanges(original, draft)).length > 0;
  const valid =
    Boolean(song.title.trim()) &&
    song.title.length <= 200 &&
    song.artist.length <= 200 &&
    (song.tempoBpm === null ||
      (Number.isInteger(song.tempoBpm) && song.tempoBpm >= 1 && song.tempoBpm <= 400));
  const patch = <K extends keyof GroupSong>(key: K, value: GroupSong[K]) => {
    if (save.isPending) return;
    setOriginal((current) => current ?? item.song);
    setDraft((current) => ({ ...(current ?? item.song), [key]: value }));
  };
  return (
    <Screen nativeHeader>
      <Stack.Screen
        options={{
          title: song.title,
          headerRight: () =>
            canEdit ? (
              <NativeHeaderButton
                label={t('Enregistrer')}
                disabled={!changed || !valid || save.isPending}
                onPress={() => save.mutate()}
              />
            ) : null,
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
      >
        <SongInfoPanel
          draft={song}
          canEdit={canEdit && !save.isPending}
          patch={patch}
          subtitle={t(self ? 'Mon répertoire' : 'Répertoire musical')}
          arrangementSubtitle={t(
            self
              ? 'Tes repères personnels ne modifient pas les morceaux de tes groupes.'
              : 'Arrangement personnel du musicien.',
          )}
        />
        {canEdit && changed ? (
          <DispoButton loading={save.isPending} disabled={!valid} onPress={() => save.mutate()}>
            {t('Enregistrer')}
          </DispoButton>
        ) : null}
        <Card style={styles.section}>
          <AppText variant="headline">{t(self ? 'Ma maîtrise' : 'Maîtrise')}</AppText>
          {canEdit ? (
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
        {canEdit ? (
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
        {canEdit && item.origin === 'manual' ? (
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
