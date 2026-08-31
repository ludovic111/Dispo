import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { GroupSong } from './group-model';
import {
  useDeleteGroupDocument,
  useDeleteSongComment,
  useGroup,
  useSaveGroupRepertoire,
  useSongComment,
  useUploadGroupDocument,
} from './group-queries';
import { openGroupDocument, searchSongCatalog, type SongCatalogResult } from './group-repository';
import { SongArtwork, SongListenSheet } from './group-song-row';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction, SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { irealDestination } from '@/domain/song';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function emptySong(userId: string, approved: boolean): GroupSong {
  return {
    albumTitle: null,
    artist: '',
    artworkUrl: null,
    catalogId: null,
    canonicalSongId: null,
    chords: null,
    composer: null,
    durationMilliseconds: null,
    form: null,
    genre: null,
    genres: [],
    id: randomUUID().toLowerCase(),
    irealDisabled: false,
    irealUrl: null,
    isrc: null,
    isApproved: approved,
    key: null,
    metadataSource: null,
    metadataUpdatedAt: null,
    platformIds: {},
    platformLinks: {},
    previewUrl: null,
    releaseYear: null,
    solos: [],
    suggestedBy: userId,
    tempoBpm: null,
    title: '',
    trackUrl: null,
  };
}

function durationLabel(milliseconds: number | null): string | null {
  if (!milliseconds || milliseconds < 0) return null;
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function GroupSongScreen({ groupId, songId }: { groupId: string; songId: string }) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = useGroup(groupId);
  const save = useSaveGroupRepertoire();
  const comment = useSongComment();
  const deleteComment = useDeleteSongComment();
  const upload = useUploadGroupDocument();
  const deleteDocument = useDeleteGroupDocument();
  const group = query.data;
  const userId = session?.user.id ?? '';
  const isNew = songId === 'new';
  const existing = group?.repertoire.find((song) => song.id === songId);
  const isLeader = group?.leaderId === userId;
  const [blankSong] = useState<GroupSong>(() => emptySong(userId, false));
  const [draftOverride, setDraftOverride] = useState<GroupSong | null>(null);
  const [catalogTerm, setCatalogTerm] = useState('');
  const [catalogResults, setCatalogResults] = useState<SongCatalogResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [listenVisible, setListenVisible] = useState(false);
  const backAction = (
    <HeaderAction icon="chevron-back" label={t('Retour')} onPress={() => router.back()} />
  );
  const baseDraft = existing ?? { ...blankSong, isApproved: isLeader === true };
  const draft = draftOverride ?? baseDraft;
  const documents = useMemo(
    () => group?.documents.filter((document) => document.songId === draft.id) ?? [],
    [draft.id, group?.documents],
  );
  const comments = useMemo(
    () => group?.comments.filter((item) => item.songId === draft.id) ?? [],
    [draft.id, group?.comments],
  );
  if (query.isLoading)
    return (
      <Screen>
        <ScreenHeader leadingAction={backAction} eyebrow={t('Répertoire')} title={t('Morceau')} />
        <LoadingState label={t('Chargement du morceau…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen>
        <ScreenHeader leadingAction={backAction} eyebrow={t('Répertoire')} title={t('Morceau')} />
        <ErrorState message={t('Le morceau n’a pas pu être chargé.')} />
      </Screen>
    );
  if (!group || (!isNew && !existing))
    return (
      <Screen>
        <ScreenHeader leadingAction={backAction} eyebrow={t('Répertoire')} title={t('Morceau')} />
        <ErrorState message={t('Ce morceau n’est plus accessible.')} />
      </Screen>
    );
  const canEdit = isNew || isLeader;
  const patch = <K extends keyof GroupSong>(key: K, value: GroupSong[K]) =>
    setDraftOverride((current) => ({ ...(current ?? baseDraft), [key]: value }));
  const searchCatalog = async () => {
    setCatalogLoading(true);
    try {
      setCatalogResults(await searchSongCatalog(catalogTerm));
    } catch {
      setCatalogResults([]);
    } finally {
      setCatalogLoading(false);
    }
  };
  const chooseCatalog = (item: SongCatalogResult) =>
    setDraftOverride((current) => ({
      ...(current ?? baseDraft),
      albumTitle: item.albumTitle,
      artist: item.artist,
      artworkUrl: item.artworkUrl,
      catalogId: item.catalogId,
      canonicalSongId: item.canonicalSongId,
      composer: item.composer,
      durationMilliseconds: item.durationMilliseconds,
      genre: item.genre,
      genres: item.genres,
      isrc: item.isrc,
      metadataSource: item.metadataSource,
      metadataUpdatedAt: item.metadataUpdatedAt,
      platformIds: item.platformIds,
      platformLinks: item.platformLinks,
      previewUrl: item.previewUrl,
      releaseYear: item.releaseYear,
      title: item.title,
      trackUrl: item.trackUrl,
    }));
  const submit = () => {
    const cleaned = { ...draft, artist: draft.artist.trim(), title: draft.title.trim() };
    const desired = isNew
      ? [...group.repertoire, cleaned]
      : group.repertoire.map((song) => (song.id === cleaned.id ? cleaned : song));
    save.mutate(
      { desired, groupId: group.id, original: group.repertoire },
      { onSuccess: () => router.back() },
    );
  };
  const removeSong = () =>
    Alert.alert(t('Retirer ce morceau ?'), t('Il disparaîtra du répertoire du groupe.'), [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () =>
          save.mutate(
            {
              desired: group.repertoire.filter((song) => song.id !== draft.id),
              groupId: group.id,
              original: group.repertoire,
            },
            { onSuccess: () => router.back() },
          ),
        style: 'destructive',
        text: t('Retirer'),
      },
    ]);
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.assets?.[0];
    if (!asset) return;
    upload.mutate({
      contentType: asset.mimeType ?? 'application/octet-stream',
      extension: asset.name.split('.').pop() ?? 'pdf',
      groupId: group.id,
      instrument: null,
      songId: draft.id,
      title: asset.name.replace(/\.[^.]+$/, ''),
      uri: asset.uri,
      userId,
    });
  };
  const arrangement = [
    draft.key?.trim(),
    draft.tempoBpm ? `${draft.tempoBpm} BPM` : null,
    draft.form?.trim(),
  ].filter((value): value is string => Boolean(value));
  const recording = [
    draft.albumTitle,
    draft.releaseYear?.toString(),
    durationLabel(draft.durationMilliseconds),
  ].filter((value): value is string => Boolean(value));
  const ireal = irealDestination(draft);
  const updateIRealUrl = (value: string) => {
    const cleaned = value.trim() || null;
    setDraftOverride((current) => {
      const source = current ?? baseDraft;
      return {
        ...source,
        irealDisabled: cleaned ? false : Boolean(source.irealUrl),
        irealUrl: cleaned,
      };
    });
  };
  const openIReal = async () => {
    if (!ireal) return;
    try {
      if (await Linking.canOpenURL(ireal.url)) {
        await Linking.openURL(ireal.url);
        return;
      }
    } catch {
      // La même issue de secours s'applique si la vérification native échoue.
    }
    const storeUrl =
      Platform.OS === 'android'
        ? 'https://play.google.com/store/apps/details?id=com.massimobiolcati.irealb'
        : 'https://apps.apple.com/app/ireal-pro/id409035833';
    Alert.alert(t('iReal Pro'), undefined, [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => void Linking.openURL(storeUrl),
        text: Platform.OS === 'android' ? t('Ouvrir') : t("Voir dans l'App Store"),
      },
    ]);
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          leadingAction={backAction}
          subtitle={group.name}
          title={
            isNew ? (isLeader ? t('Ajouter un morceau') : t('Suggérer un morceau')) : draft.title
          }
        />
        {isNew ? (
          <Card style={styles.card}>
            <AppText variant="title">{t('Catalogue musical')}</AppText>
            <View style={styles.searchRow}>
              <View style={styles.flex}>
                <FormField
                  label={t('Chercher')}
                  onChangeText={setCatalogTerm}
                  onSubmitEditing={() => void searchCatalog()}
                  placeholder={t('Titre ou artiste')}
                  returnKeyType="search"
                  value={catalogTerm}
                />
              </View>
              <Pressable
                accessibilityLabel={t('Rechercher')}
                accessibilityRole="button"
                disabled={catalogLoading || catalogTerm.trim().length < 2}
                onPress={() => void searchCatalog()}
                style={[styles.searchButton, { backgroundColor: palette.electric }]}
              >
                <Ionicons color="#050814" name="search" size={19} />
              </Pressable>
            </View>
            {catalogResults.map((item) => (
              <Pressable
                key={item.catalogId}
                onPress={() => chooseCatalog(item)}
                style={[styles.catalogRow, { borderBottomColor: palette.border }]}
              >
                <SongArtwork artworkUrl={item.artworkUrl} radius={8} size={42} />
                <View style={styles.flex}>
                  <AppText numberOfLines={1} style={styles.bold}>
                    {item.title}
                  </AppText>
                  <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                    {item.artist}
                    {item.albumTitle ? ` · ${item.albumTitle}` : ''}
                  </AppText>
                </View>
                <Ionicons
                  color={draft.catalogId === item.catalogId ? palette.electric : palette.muted}
                  name={
                    draft.catalogId === item.catalogId ? 'checkmark-circle' : 'add-circle-outline'
                  }
                  size={21}
                />
              </Pressable>
            ))}
          </Card>
        ) : null}
        <Card style={styles.card}>
          <View style={styles.songHero}>
            <SongArtwork artworkUrl={draft.artworkUrl} radius={10} size={54} />
            <View style={styles.heroCopy}>
              <AppText numberOfLines={2} style={styles.heroTitle} variant="title3">
                {draft.title || t('Titre')}
              </AppText>
              {arrangement.length ? (
                <View style={[styles.arrangementChip, { backgroundColor: `${palette.bronze}1F` }]}>
                  <Ionicons color={palette.bronze} name="speedometer-outline" size={10} />
                  <AppText
                    color={palette.bronze}
                    numberOfLines={1}
                    style={styles.arrangementText}
                    variant="caption2"
                  >
                    {arrangement.join(' · ')}
                  </AppText>
                </View>
              ) : null}
              <AppText color={palette.muted} numberOfLines={1} variant="caption">
                {draft.artist || t('Artiste')}
              </AppText>
              {recording.length ? (
                <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                  {recording.join(' · ')}
                </AppText>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel={t('Écouter ce morceau')}
              accessibilityRole="button"
              hitSlop={4}
              onPress={() => setListenVisible(true)}
              style={[styles.heroAction, { backgroundColor: palette.inset }]}
            >
              <Ionicons color={palette.bronze} name="headset" size={18} />
            </Pressable>
          </View>
          {!draft.isApproved ? (
            <Tag color={palette.signal} label={t('Suggestion à valider')} />
          ) : null}
          {canEdit ? (
            <View style={styles.editorFields}>
              <FormField
                label={t('Titre')}
                onChangeText={(value) => patch('title', value)}
                value={draft.title}
              />
              <FormField
                label={t('Artiste')}
                onChangeText={(value) => patch('artist', value)}
                value={draft.artist}
              />
            </View>
          ) : null}
        </Card>
        <SongListenSheet
          onClose={() => setListenVisible(false)}
          song={draft}
          visible={listenVisible}
        />
        <Card style={styles.card}>
          <SectionHeader subtitle={t('Arrangement partagé avec le groupe')} title={t('Repères')} />
          <View style={styles.fieldsRow}>
            <View style={styles.flex}>
              <FormField
                autoCapitalize="characters"
                editable={canEdit}
                label={t('Tonalité')}
                onChangeText={(value) => patch('key', value.trim() || null)}
                placeholder={t('Bb, F#m…')}
                value={draft.key ?? ''}
              />
            </View>
            <View style={styles.flex}>
              <FormField
                editable={canEdit}
                keyboardType="number-pad"
                label={t('Tempo BPM')}
                onChangeText={(value) => patch('tempoBpm', Number.parseInt(value, 10) || null)}
                value={draft.tempoBpm?.toString() ?? ''}
              />
            </View>
          </View>
          <FormField
            editable={canEdit}
            label={t('Forme')}
            onChangeText={(value) => patch('form', value.trim() || null)}
            placeholder={t('AABA, ABAB…')}
            value={draft.form ?? ''}
          />
          <FormField
            editable={canEdit}
            label={t('Grille d’accords')}
            multiline
            onChangeText={(value) => patch('chords', value || null)}
            placeholder={t('| Cmaj7 | Dm7 G7 | …')}
            style={styles.multiline}
            value={draft.chords ?? ''}
          />
        </Card>
        <Card style={styles.card}>
          <SectionHeader subtitle={t('Ouvrir dans iReal Pro')} title={t('iReal Pro')} />
          {canEdit ? (
            <FormField
              autoCapitalize="none"
              label={t('Lien iReal Pro')}
              onChangeText={updateIRealUrl}
              placeholder={t('irealbook://…')}
              value={draft.irealUrl ?? ''}
            />
          ) : null}
          <DispoButton
            disabled={!ireal}
            icon={ireal?.kind === 'direct' ? 'open-outline' : 'search'}
            onPress={() => void openIReal()}
          >
            {ireal?.kind === 'direct' ? t('Ouvrir dans iReal Pro') : t('Chercher dans iReal Pro')}
          </DispoButton>
        </Card>
        {!isNew ? (
          <Card style={styles.card}>
            <SectionHeader subtitle={t('Ordre de passage')} title={t('Solos')} />
            <View style={styles.wrap}>
              {group.members.map((member) => (
                <ChoiceChip
                  key={member.id}
                  label={member.name}
                  onPress={() => {
                    if (!isLeader) return;
                    patch(
                      'solos',
                      draft.solos.includes(member.id)
                        ? draft.solos.filter((id) => id !== member.id)
                        : [...draft.solos, member.id],
                    );
                  }}
                  selected={draft.solos.includes(member.id)}
                />
              ))}
            </View>
          </Card>
        ) : null}
        {!isNew ? (
          <Card style={styles.card}>
            <View style={styles.sectionRow}>
              <SectionHeader subtitle={t('Partitions liées au morceau')} title={t('Documents')} />
              <Pressable
                accessibilityLabel={t('Ajouter un document')}
                accessibilityRole="button"
                onPress={() => void pickDocument()}
                style={[styles.roundButton, { borderColor: palette.border }]}
              >
                <Ionicons color={palette.electric} name="add" size={20} />
              </Pressable>
            </View>
            {documents.map((document) => (
              <View
                key={document.id}
                style={[styles.documentRow, { borderBottomColor: palette.border }]}
              >
                <Pressable
                  onPress={() => void openGroupDocument(document)}
                  style={styles.documentOpen}
                >
                  <Ionicons color={palette.electric} name="document-text" size={18} />
                  <View style={styles.flex}>
                    <AppText style={styles.bold}>{document.title}</AppText>
                    <AppText color={palette.muted} variant="caption2">
                      {document.extension.toUpperCase()}
                      {document.instrument ? ` · ${t(document.instrument)}` : ''}
                    </AppText>
                  </View>
                </Pressable>
                {isLeader ? (
                  <Pressable
                    accessibilityLabel={t('Supprimer le document')}
                    accessibilityRole="button"
                    onPress={() => deleteDocument.mutate(document)}
                    style={styles.iconAction}
                  >
                    <Ionicons color={palette.signal} name="trash-outline" size={17} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {!documents.length ? (
              <AppText color={palette.muted} variant="caption">
                {t('Aucune partition liée.')}
              </AppText>
            ) : null}
          </Card>
        ) : null}
        {!isNew ? (
          <Card style={styles.card}>
            <SectionHeader subtitle={t('Notes du groupe')} title={t('Commentaires')} />
            {comments.map((item) => (
              <View key={item.id} style={styles.commentRow}>
                <Avatar name={item.authorName} size={30} />
                <View style={styles.flex}>
                  <AppText style={styles.bold} variant="caption">
                    {item.authorName}
                  </AppText>
                  <AppText>{item.text}</AppText>
                </View>
                {isLeader || item.authorId === userId ? (
                  <Pressable
                    accessibilityLabel={t('Supprimer')}
                    accessibilityRole="button"
                    onPress={() => deleteComment.mutate(item.id)}
                    style={styles.iconAction}
                  >
                    <Ionicons color={palette.signal} name="trash-outline" size={16} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            <View style={styles.commentComposer}>
              <View style={styles.flex}>
                <FormField
                  label={t('Ajouter une note')}
                  onChangeText={setCommentText}
                  placeholder={t('Intro, fin, consigne…')}
                  value={commentText}
                />
              </View>
              <Pressable
                accessibilityLabel={t('Envoyer')}
                accessibilityRole="button"
                disabled={!commentText.trim()}
                onPress={() =>
                  comment.mutate(
                    { groupId: group.id, songId: draft.id, text: commentText },
                    { onSuccess: () => setCommentText('') },
                  )
                }
                style={[styles.searchButton, { backgroundColor: palette.electric }]}
              >
                <Ionicons color="#050814" name="arrow-up" size={18} />
              </Pressable>
            </View>
          </Card>
        ) : null}
        {canEdit ? (
          <DispoButton
            disabled={!draft.title.trim() || !draft.artist.trim()}
            loading={save.isPending}
            onPress={submit}
          >
            {isNew
              ? isLeader
                ? t('Ajouter au répertoire')
                : t('Envoyer la suggestion')
              : t('Enregistrer le morceau')}
          </DispoButton>
        ) : null}
        {!isNew ? (
          <DispoButton
            icon="copy-outline"
            onPress={() => router.push(`/groups/${group.id}/songs/${draft.id}/copy` as never)}
            variant="secondary"
          >
            {t('Copier le morceau')}
          </DispoButton>
        ) : null}
        {!isNew && isLeader ? (
          <DispoButton onPress={removeSong} variant="danger">
            {t('Retirer du répertoire')}
          </DispoButton>
        ) : null}
        {save.error ? (
          <AppText color={palette.error} style={styles.center} variant="caption">
            {t('Le morceau n’a pas pu être enregistré. Il est peut-être déjà dans le répertoire.')}
          </AppText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  arrangementChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.compact,
    maxWidth: '100%',
    paddingHorizontal: 7,
    paddingVertical: spacing.xxs,
  },
  arrangementText: { flexShrink: 1, fontWeight: '800' },
  bold: { fontWeight: '700' },
  card: { gap: spacing.sm },
  catalogRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  center: { textAlign: 'center' },
  commentComposer: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs },
  commentRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  documentOpen: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
  },
  documentRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  editorFields: { gap: spacing.sm },
  fieldsRow: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  heroAction: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  heroCopy: { flex: 1, gap: spacing.xxxs, minWidth: 0 },
  heroTitle: { fontSize: 19, lineHeight: 23 },
  iconAction: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  roundButton: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  searchButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginBottom: 3,
    width: 44,
  },
  searchRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  songHero: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
