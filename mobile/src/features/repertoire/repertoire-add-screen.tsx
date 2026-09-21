import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { repertoireStyles, withoutSongArtwork } from './repertoire-model';
import { addPersonalSong } from './repertoire-repository';

import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { type GroupSong } from '@/features/groups/group-model';
import {
  enrichSongCatalogResult,
  type SongCatalogResult,
} from '@/features/groups/group-repository';
import {
  emptyGroupSong,
  mergeCatalogEnrichment,
  selectCatalogSong,
} from '@/features/groups/song-catalog-model';
import { SongCatalogPicker } from '@/features/groups/song-catalog-picker';
import { SongInfoPanel } from '@/features/groups/song-info-panel';
import { hideAlbumCoversKey, useBooleanPreference } from '@/features/settings/settings-storage';
import { spacing } from '@/theme/tokens';

export function RepertoireAddScreen() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [draft, setDraft] = useState<GroupSong>(() =>
    emptyGroupSong(randomUUID(), session?.user.id ?? '', true),
  );
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const hasSelection = manualEntry || draft.catalogId !== null;
  const [hideArtwork] = useBooleanPreference(hideAlbumCoversKey);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const choose = (item: SongCatalogResult) => {
    setManualEntry(false);
    const id = ++request.current;
    setDraft((current) => selectCatalogSong(current, item));
    setLoadingMetadata(true);
    void enrichSongCatalogResult(item)
      .then(({ refreshed }) => {
        if (refreshed && request.current === id)
          setDraft((current) =>
            current.catalogId === item.catalogId
              ? mergeCatalogEnrichment(current, refreshed)
              : current,
          );
      })
      .catch(() => undefined)
      .finally(() => {
        if (request.current === id) setLoadingMetadata(false);
      });
  };
  const add = useMutation({
    mutationFn: async () => {
      const id = await addPersonalSong({
        ...draft,
        title: draft.title.trim(),
        artist: draft.artist.trim(),
      });
      return id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['personal-repertoire'] }),
        client.invalidateQueries({ queryKey: ['profiles'] }),
        client.invalidateQueries({ queryKey: ['gigs'] }),
      ]);
      router.replace({
        pathname: '/repertoire/songs/[songId]',
        params: { songId: id, profileId: session?.user.id },
      } as never);
    },
    onError: () => Alert.alert(t('Le morceau n’a pas pu être ajouté.')),
  });
  const patch = <K extends keyof GroupSong>(key: K, value: GroupSong[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const valid =
    hasSelection &&
    Boolean(draft.title.trim() && session?.user.id) &&
    draft.title.length <= 200 &&
    draft.artist.length <= 200 &&
    (draft.tempoBpm === null ||
      (Number.isInteger(draft.tempoBpm) && draft.tempoBpm >= 1 && draft.tempoBpm <= 400));
  return (
    <Screen nativeHeader>
      <Stack.Screen
        options={{
          title: t('Ajouter un morceau'),
          headerRight: () => (
            <NativeHeaderButton
              label={t('Ajouter')}
              disabled={!valid || add.isPending}
              onPress={() => add.mutate()}
            />
          ),
        }}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <SongCatalogPicker
          onSelect={choose}
          onManual={() => {
            if (manualEntry) return;
            request.current += 1;
            setLoadingMetadata(false);
            setDraft(emptyGroupSong(draft.id, session?.user.id ?? '', true));
            setManualEntry(true);
          }}
          selectedId={draft.catalogId}
          loadingMetadata={loadingMetadata}
        />
        {hasSelection ? (
          <>
            <SongInfoPanel
              draft={hideArtwork ? withoutSongArtwork(draft) : draft}
              canEdit={!add.isPending}
              patch={patch}
              subtitle={t('Mon répertoire')}
              arrangementSubtitle={t(
                'Tes repères personnels ne modifient pas les morceaux de tes groupes.',
              )}
            />
            <Card style={styles.section}>
              <SectionHeader title={t('Style')} />
              <View style={styles.chips}>
                {repertoireStyles.map((style) => (
                  <ChoiceChip
                    key={style}
                    label={t(style)}
                    selected={draft.genre === style}
                    onPress={() =>
                      setDraft((current) => ({ ...current, genre: style, genres: [style] }))
                    }
                  />
                ))}
              </View>
            </Card>
            <DispoButton disabled={!valid} loading={add.isPending} onPress={() => add.mutate()}>
              {t('Ajouter à mon répertoire')}
            </DispoButton>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: spacing.xxl, gap: spacing.sm },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
