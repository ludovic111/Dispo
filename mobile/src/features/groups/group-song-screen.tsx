import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function emptySong(userId: string, approved: boolean): GroupSong {
  return {
    albumTitle: null,
    artist: '',
    artworkUrl: null,
    catalogId: null,
    chords: null,
    durationMilliseconds: null,
    form: null,
    genre: null,
    id: randomUUID().toLowerCase(),
    irealDisabled: false,
    irealUrl: null,
    isApproved: approved,
    key: null,
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
        <LoadingState label={t('Chargement du morceau…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen>
        <ErrorState message={t('Le morceau n’a pas pu être chargé.')} />
      </Screen>
    );
  if (!group || (!isNew && !existing))
    return (
      <Screen>
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
      durationMilliseconds: item.durationMilliseconds,
      genre: item.genre,
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
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          icon="musical-notes"
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
                {item.artworkUrl ? (
                  <Image source={{ uri: item.artworkUrl }} style={styles.artworkSmall} />
                ) : (
                  <View style={[styles.artworkSmall, { backgroundColor: palette.inset }]} />
                )}
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
            {draft.artworkUrl ? (
              <Image source={{ uri: draft.artworkUrl }} style={styles.artwork} />
            ) : (
              <View
                style={[styles.artwork, styles.artworkFallback, { backgroundColor: palette.inset }]}
              >
                <Ionicons color={palette.bronze} name="musical-notes" size={32} />
              </View>
            )}
            <View style={styles.flex}>
              <FormField
                editable={canEdit}
                label={t('Titre')}
                onChangeText={(value) => patch('title', value)}
                value={draft.title}
              />
              <FormField
                editable={canEdit}
                label={t('Artiste')}
                onChangeText={(value) => patch('artist', value)}
                value={draft.artist}
              />
            </View>
          </View>
          {!draft.isApproved ? (
            <Tag color={palette.signal} label={t('Suggestion à valider')} />
          ) : null}
          {draft.trackUrl ? (
            <Pressable onPress={() => void Linking.openURL(draft.trackUrl!)} style={styles.link}>
              <Ionicons color={palette.electric} name="logo-apple" size={16} />
              <AppText color={palette.electric} variant="caption">
                {t('Ouvrir dans Apple Music')}
              </AppText>
            </Pressable>
          ) : null}
        </Card>
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
          <FormField
            autoCapitalize="none"
            editable={canEdit}
            label={t('Lien iReal Pro')}
            onChangeText={(value) => patch('irealUrl', value.trim() || null)}
            placeholder={t('irealbook://…')}
            value={draft.irealUrl ?? ''}
          />
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
                  <Pressable onPress={() => deleteDocument.mutate(document)}>
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
                  <Pressable onPress={() => deleteComment.mutate(item.id)}>
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
  artwork: { borderRadius: 16, height: 112, width: 112 },
  artworkFallback: { alignItems: 'center', justifyContent: 'center' },
  artworkSmall: { borderRadius: 8, height: 42, width: 42 },
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
  documentOpen: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.xs },
  documentRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  fieldsRow: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  link: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  roundButton: {
    alignItems: 'center',
    borderRadius: 19,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  searchButton: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    marginBottom: 3,
    width: 42,
  },
  searchRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  songHero: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
