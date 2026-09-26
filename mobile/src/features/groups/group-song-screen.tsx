import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Dimensions,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import type { GroupSong } from './group-model';
import {
  useDeleteGroupDocument,
  useGroup,
  useSaveEventSetlist,
  useSaveGroupRepertoire,
  useUploadGroupDocument,
} from './group-queries';
import {
  enrichSongCatalogResult,
  openGroupDocument,
  type SongCatalogResult,
} from './group-repository';
import { songSoloOrder, TRADING_FOURS_SOLO_ID, withSoloOrder } from './group-song-row-model';
import { emptyGroupSong, mergeCatalogEnrichment, selectCatalogSong } from './song-catalog-model';
import { SongCatalogPicker } from './song-catalog-picker';
import { SongCommentsPanel } from './song-comments-panel';
import { SongDetailTabs, type SongDetailTab } from './song-detail-tabs';
import { SongInfoPanel } from './song-info-panel';
import { TradingFoursIcon } from './trading-fours-icon';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { ListRow } from '@/components/ui/list-row';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function SongKeyboardScrollView({
  children,
  keyboardInset,
  scrollRef,
}: {
  children: ReactNode;
  keyboardInset: number;
  scrollRef: RefObject<ScrollView | null>;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={[
          styles.content,
          keyboardInset ? { paddingBottom: keyboardInset + spacing.lg } : undefined,
        ]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function songCatalogSource(song: GroupSong): SongCatalogResult | null {
  if (!song.catalogId || !song.canonicalSongId) return null;
  return {
    albumTitle: song.albumTitle,
    artist: song.artist,
    artworkUrl: song.artworkUrl,
    catalogId: song.catalogId,
    canonicalSongId: song.canonicalSongId,
    composer: song.composer,
    durationMilliseconds: song.durationMilliseconds,
    genre: song.genre,
    genres: song.genres,
    isrc: song.isrc,
    key: song.key,
    metadataSource: song.metadataSource ?? 'canonical',
    metadataUpdatedAt: song.metadataUpdatedAt ?? new Date(0).toISOString(),
    platformIds: song.platformIds,
    platformLinks: song.platformLinks,
    previewUrl: song.previewUrl,
    releaseYear: song.releaseYear,
    tempoBpm: song.tempoBpm,
    title: song.title,
    trackUrl: song.trackUrl,
  };
}

export function GroupSongScreen({
  groupId,
  songId,
  sourceEventId,
}: {
  groupId: string;
  songId: string;
  sourceEventId: string | null;
}) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [manualEntry, setManualEntry] = useState(false);
  const { palette } = useDispoTheme();
  const query = useGroup(groupId);
  const saveRepertoire = useSaveGroupRepertoire();
  const saveSetlist = useSaveEventSetlist();
  const upload = useUploadGroupDocument();
  const deleteDocument = useDeleteGroupDocument();
  const group = query.data;
  const userId = session?.user.id ?? '';
  const isNew = songId === 'new';
  const sourceEvent = sourceEventId
    ? group?.events.find((event) => event.id === sourceEventId)
    : undefined;
  const collection = sourceEventId ? (sourceEvent?.setlist ?? []) : (group?.repertoire ?? []);
  const existing = collection.find((song) => song.id === songId);
  const isLeader = group?.leaderId === userId;
  const [blankSong] = useState<GroupSong>(() =>
    emptyGroupSong(randomUUID().toLowerCase(), userId, false),
  );
  const [draftOverride, setDraftOverride] = useState<GroupSong | null>(null);
  const [catalogLoadingMetadata, setCatalogLoadingMetadata] = useState(false);
  const catalogRequestRef = useRef(0);
  const enrichedExistingRef = useRef(new Set<string>());
  const [activeTab, setActiveTab] = useState<SongDetailTab>('info');
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [commentDraft, setCommentDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);
  const commentInputFocusedRef = useRef(false);
  const revealCommentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [soloPickerVisible, setSoloPickerVisible] = useState(false);
  const [documentInstrument, setDocumentInstrument] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const baseDraft = existing ?? { ...blankSong, isApproved: isLeader === true };
  const draft = draftOverride ?? baseDraft;
  const draftSolos = useMemo(() => songSoloOrder(draft), [draft]);
  const documents = useMemo(
    () => group?.documents.filter((document) => document.songId === draft.id) ?? [],
    [draft.id, group?.documents],
  );
  const comments = useMemo(
    () => group?.comments.filter((item) => item.songId === draft.id) ?? [],
    [draft.id, group?.comments],
  );
  const selectableSoloMembers = useMemo(
    () => group?.members.filter((member) => !draftSolos.includes(member.id)) ?? [],
    [draftSolos, group?.members],
  );
  const documentInstruments = useMemo(
    () =>
      [...new Set(group?.members.flatMap((member) => member.instruments) ?? [])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [group?.members],
  );

  useEffect(() => {
    if (!existing || draftOverride || enrichedExistingRef.current.has(existing.id)) return;
    const source = songCatalogSource(existing);
    const incomplete =
      source &&
      (!source.artworkUrl ||
        !source.previewUrl ||
        !source.isrc ||
        Object.keys(source.platformLinks).length < 6);
    if (!source || !incomplete) return;
    enrichedExistingRef.current.add(existing.id);
    void enrichSongCatalogResult(source)
      .then(({ refreshed }) => {
        if (!refreshed) return;
        setDraftOverride((current) => {
          const selected = current ?? existing;
          if (selected.catalogId !== source.catalogId) return selected;
          return mergeCatalogEnrichment(selected, refreshed);
        });
      })
      .catch(() => {
        // Enrichissement opportuniste : la fiche reste utilisable hors ligne.
      });
  }, [draftOverride, existing]);

  const revealCommentComposer = useCallback(() => {
    commentInputFocusedRef.current = true;
    if (Platform.OS === 'android') {
      setKeyboardInset((current) =>
        current > 0 ? current : Math.round(Dimensions.get('window').height * 0.48),
      );
    }
    if (revealCommentTimerRef.current) clearTimeout(revealCommentTimerRef.current);
    const revealFocusedInput = () => {
      const keyboardMetrics = Keyboard.metrics();
      if (Platform.OS === 'android' && keyboardMetrics?.height) {
        setKeyboardInset(keyboardMetrics.height);
      }
      const inputHandle = findNodeHandle(commentInputRef.current);
      if (inputHandle) {
        scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
          inputHandle,
          spacing.sm,
          true,
        );
      } else {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    };
    requestAnimationFrame(revealFocusedInput);
    revealCommentTimerRef.current = setTimeout(revealFocusedInput, 420);
  }, []);

  useEffect(() => {
    const keyboardEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSubscription = Keyboard.addListener(keyboardEvent, (event) => {
      if (Platform.OS === 'android') setKeyboardInset(event.endCoordinates.height);
      if (commentInputFocusedRef.current) revealCommentComposer();
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardInset(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (revealCommentTimerRef.current) clearTimeout(revealCommentTimerRef.current);
    };
  }, [revealCommentComposer]);

  useEffect(() => {
    if (!keyboardInset || !commentInputFocusedRef.current) return;
    const reveal = () => scrollRef.current?.scrollToEnd({ animated: true });
    const layoutTimer = setTimeout(reveal, 80);
    const keyboardTimer = setTimeout(reveal, 700);
    return () => {
      clearTimeout(layoutTimer);
      clearTimeout(keyboardTimer);
    };
  }, [keyboardInset]);

  if (query.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement du morceau…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Le morceau n’a pas pu être chargé.')} />
      </Screen>
    );
  if (!group || (sourceEventId && !sourceEvent) || (!isNew && !existing))
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Ce morceau n’est plus accessible.')} />
      </Screen>
    );
  const canEdit = isNew || isLeader;
  const patch = <K extends keyof GroupSong>(key: K, value: GroupSong[K]) =>
    setDraftOverride((current) =>
      key === 'solos'
        ? withSoloOrder(current ?? baseDraft, value as string[])
        : { ...(current ?? baseDraft), [key]: value },
    );
  const chooseCatalog = (item: SongCatalogResult) => {
    setManualEntry(false);
    const catalogRequest = ++catalogRequestRef.current;
    setDraftOverride((current) => selectCatalogSong(current ?? baseDraft, item));
    setCatalogLoadingMetadata(true);
    void enrichSongCatalogResult(item)
      .then(({ refreshed }) => {
        if (!refreshed || catalogRequestRef.current !== catalogRequest) return;
        setDraftOverride((current) => {
          const source = current ?? baseDraft;
          if (source.catalogId !== item.catalogId) return source;
          return mergeCatalogEnrichment(source, refreshed);
        });
      })
      .catch(() => {
        // Les liens connus restent visibles si l'enrichissement réseau échoue.
      })
      .finally(() => {
        if (catalogRequestRef.current === catalogRequest) setCatalogLoadingMetadata(false);
      });
  };
  const submit = () => {
    const cleaned = { ...draft, artist: draft.artist.trim(), title: draft.title.trim() };
    const desired = isNew
      ? [...collection, cleaned]
      : collection.map((song) => (song.id === cleaned.id ? cleaned : song));
    if (sourceEvent) {
      saveSetlist.mutate(
        { desired, eventId: sourceEvent.id, original: sourceEvent.setlist },
        { onSuccess: () => router.back() },
      );
    } else {
      saveRepertoire.mutate(
        { desired, groupId: group.id, original: group.repertoire },
        { onSuccess: () => router.back() },
      );
    }
  };
  const removeSong = () =>
    Alert.alert(
      t('Retirer ce morceau ?'),
      sourceEvent ? undefined : t('Il disparaîtra du répertoire du groupe.'),
      [
        { style: 'cancel', text: t('Annuler') },
        {
          onPress: () => {
            const desired = collection.filter((song) => song.id !== draft.id);
            if (sourceEvent) {
              saveSetlist.mutate(
                { desired, eventId: sourceEvent.id, original: sourceEvent.setlist },
                { onSuccess: () => router.back() },
              );
            } else {
              saveRepertoire.mutate(
                { desired, groupId: group.id, original: group.repertoire },
                { onSuccess: () => router.back() },
              );
            }
          },
          style: 'destructive',
          text: t('Retirer'),
        },
      ],
    );
  const uploadDocument = (asset: {
    contentType: string;
    extension: string;
    name: string;
    uri: string;
  }) => {
    setDocumentError(null);
    upload.mutate(
      {
        contentType: asset.contentType,
        extension: asset.extension,
        groupId: group.id,
        instrument: documentInstrument,
        songId: draft.id,
        title: asset.name.replace(/\.[^.]+$/, ''),
        uri: asset.uri,
        userId,
      },
      {
        onError: () =>
          setDocumentError(t("La partition n'a pas pu être envoyée — vérifie le réseau.")),
      },
    );
  };
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'],
      });
      const asset = result.assets?.[0];
      if (!asset) return;
      uploadDocument({
        contentType: asset.mimeType ?? 'application/octet-stream',
        extension: asset.name.split('.').pop() ?? 'pdf',
        name: asset.name,
        uri: asset.uri,
      });
    } catch {
      setDocumentError(t("Le document n'a pas pu être importé."));
    }
  };
  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
        quality: 0.82,
      });
      const asset = result.assets?.[0];
      if (!asset) return;
      const jpeg = await manipulateAsync(asset.uri, [], {
        compress: 0.85,
        format: SaveFormat.JPEG,
      });
      const name = `${asset.fileName?.replace(/\.[^.]+$/, '') || t('Photo')}.jpg`;
      uploadDocument({
        contentType: 'image/jpeg',
        extension: 'jpg',
        name,
        uri: jpeg.uri,
      });
    } catch {
      setDocumentError(t("Le document n'a pas pu être importé."));
    }
  };
  const openDocument = async (document: (typeof documents)[number]) => {
    setDocumentError(null);
    try {
      await openGroupDocument(document);
    } catch {
      setDocumentError(t("La partition n'a pas pu être ouverte — vérifie le réseau."));
    }
  };
  const moveSolo = (index: number, offset: number) => {
    const destination = index + offset;
    if (destination < 0 || destination >= draftSolos.length) return;
    const next = [...draftSolos];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    void Haptics.selectionAsync();
    patch('solos', next);
  };
  return (
    <Screen nativeHeader>
      <Stack.Screen
        options={{
          headerRight: () =>
            canEdit && activeTab !== 'comments' && activeTab !== 'documents' ? (
              <NativeHeaderButton
                disabled={!draft.title.trim() || saveRepertoire.isPending || saveSetlist.isPending}
                label={isNew ? t('Ajouter') : t('Enregistrer')}
                onPress={submit}
              />
            ) : null,
          title: isNew
            ? isLeader
              ? t('Ajouter un morceau')
              : t('Suggérer un morceau')
            : draft.title,
        }}
      />
      {!isNew ? (
        <SongDetailTabs
          selected={activeTab}
          onSelect={(tab) => {
            Keyboard.dismiss();
            commentInputFocusedRef.current = false;
            if (revealCommentTimerRef.current) clearTimeout(revealCommentTimerRef.current);
            setKeyboardInset(0);
            setActiveTab(tab);
          }}
        />
      ) : null}
      <SongKeyboardScrollView key={activeTab} keyboardInset={keyboardInset} scrollRef={scrollRef}>
        {activeTab === 'info' ? (
          <>
            {isNew ? (
              <SongCatalogPicker
                onSelect={chooseCatalog}
                onManual={() => {
                  if (manualEntry) return;
                  catalogRequestRef.current += 1;
                  setCatalogLoadingMetadata(false);
                  setDraftOverride(baseDraft);
                  setManualEntry(true);
                }}
                selectedId={draft.catalogId}
                loadingMetadata={catalogLoadingMetadata}
              />
            ) : null}
            {!isNew || manualEntry || draft.catalogId !== null ? (
              <SongInfoPanel
                draft={draft}
                onGenreChange={(genre) =>
                  setDraftOverride((current) => ({
                    ...(current ?? baseDraft),
                    genre,
                    genres: [genre],
                  }))
                }
                canEdit={canEdit}
                leaderId={group.leaderId}
                members={group.members}
                patch={patch}
                subtitle={group.name}
                arrangementSubtitle={t('Arrangement partagé avec le groupe')}
              />
            ) : null}
          </>
        ) : null}
        {!isNew && activeTab === 'solos' ? (
          <Card style={styles.card}>
            <SectionHeader
              subtitle={t(
                'Ajoute les solos dans leur ordre de passage — tout le groupe verra la même liste.',
              )}
              title={t('Solos')}
            />
            {draftSolos.length === 0 ? (
              <AppText color={palette.muted} style={styles.soloEmpty} variant="subheadline">
                {t('Aucun solo prévu')}
              </AppText>
            ) : (
              <View style={styles.soloList}>
                {draftSolos.map((memberId, index) => {
                  const isTradingFours = memberId === TRADING_FOURS_SOLO_ID;
                  const member = group.members.find((item) => item.id === memberId);
                  const name = isTradingFours ? TRADING_FOURS_SOLO_ID : (member?.name ?? memberId);
                  return (
                    <Card key={memberId} padding={spacing.xs} style={styles.soloRow} tone="inset">
                      <AppText color={palette.muted} style={styles.soloIndex} variant="mono">
                        {index + 1}
                      </AppText>
                      {isTradingFours ? (
                        <TradingFoursIcon />
                      ) : (
                        <Avatar name={name} size={34} uri={member?.photoUrl ?? null} />
                      )}
                      <View style={styles.soloCopy}>
                        <AppText numberOfLines={1} variant="headline">
                          {name}
                        </AppText>
                        {member?.instruments.length ? (
                          <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                            {member.instruments.map((instrument) => t(instrument)).join(' · ')}
                          </AppText>
                        ) : null}
                      </View>
                      {isLeader ? (
                        <View style={styles.soloActions}>
                          <IconButton
                            accessibilityLabel={t('Monter')}
                            disabled={index === 0}
                            icon="chevron-up"
                            iconColor={palette.text}
                            onPress={() => moveSolo(index, -1)}
                            variant="plain"
                          />
                          <IconButton
                            accessibilityLabel={t('Descendre')}
                            disabled={index === draftSolos.length - 1}
                            icon="chevron-down"
                            iconColor={palette.text}
                            onPress={() => moveSolo(index, 1)}
                            variant="plain"
                          />
                          <IconButton
                            accessibilityLabel={t('Retirer ce solo')}
                            icon="close"
                            iconColor={palette.error}
                            onPress={() =>
                              patch(
                                'solos',
                                draftSolos.filter((id) => id !== memberId),
                              )
                            }
                            variant="plain"
                          />
                        </View>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            )}
            {isLeader ? (
              <>
                {selectableSoloMembers.length > 0 || !draftSolos.includes(TRADING_FOURS_SOLO_ID) ? (
                  <DispoButton
                    icon={soloPickerVisible ? 'chevron-up' : 'add'}
                    onPress={() => setSoloPickerVisible((visible) => !visible)}
                    variant="secondary"
                  >
                    {t('Ajouter un solo')}
                  </DispoButton>
                ) : null}
                {soloPickerVisible ? (
                  <View>
                    {!draftSolos.includes(TRADING_FOURS_SOLO_ID) ? (
                      <ListRow
                        accessory={
                          <Ionicons color={palette.electric} name="add-circle" size={22} />
                        }
                        leading={<TradingFoursIcon />}
                        onPress={() => patch('solos', [...draftSolos, TRADING_FOURS_SOLO_ID])}
                        title={TRADING_FOURS_SOLO_ID}
                        tone="plain"
                      />
                    ) : null}
                    {selectableSoloMembers.map((member) => (
                      <ListRow
                        accessory={
                          <Ionicons color={palette.electric} name="add-circle" size={22} />
                        }
                        key={member.id}
                        leading={<Avatar name={member.name} size={36} uri={member.photoUrl} />}
                        onPress={() => patch('solos', [...draftSolos, member.id])}
                        title={member.name}
                        tone="plain"
                        {...(member.instruments.length
                          ? {
                              subtitle: member.instruments
                                .map((instrument) => t(instrument))
                                .join(' · '),
                            }
                          : {})}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}
        {!isNew && activeTab === 'documents' ? (
          <Card style={styles.card}>
            <SectionHeader title={t('Documents')} />
            <View style={styles.wrap}>
              <ChoiceChip
                label={t('Tout le monde')}
                onPress={() => setDocumentInstrument(null)}
                selected={documentInstrument === null}
              />
              {documentInstruments.map((instrument) => (
                <ChoiceChip
                  key={instrument}
                  label={t(instrument)}
                  onPress={() => setDocumentInstrument(instrument)}
                  selected={documentInstrument === instrument}
                />
              ))}
            </View>
            <View style={styles.documentActions}>
              <DispoButton
                icon="image-outline"
                onPress={() => void pickPhoto()}
                variant="secondary"
              >
                {t('Photo')}
              </DispoButton>
              <DispoButton
                icon="document-attach-outline"
                onPress={() => void pickDocument()}
                variant="secondary"
              >
                {t('Fichier')}
              </DispoButton>
            </View>
            {documents.map((document) => (
              <ListRow
                accessibilityLabel={`${t('Ouvrir')} ${document.title}`}
                accessory={
                  isLeader || document.addedById === userId ? (
                    <IconButton
                      accessibilityLabel={t('Supprimer le document')}
                      icon="trash-outline"
                      iconColor={palette.error}
                      onPress={() =>
                        deleteDocument.mutate(document, {
                          onError: () =>
                            setDocumentError(
                              t("L'action n'a pas pu être enregistrée. Réessaie dans un instant."),
                            ),
                        })
                      }
                      variant="plain"
                    />
                  ) : (
                    <Ionicons color={palette.muted} name="chevron-forward" size={18} />
                  )
                }
                key={document.id}
                leadingIcon="document-text"
                onPress={() => void openDocument(document)}
                subtitle={`${document.extension.toUpperCase()}${
                  document.instrument ? ` · ${t(document.instrument)}` : ''
                }`}
                title={document.title}
                tone="plain"
              />
            ))}
            {!documents.length ? (
              <AppText color={palette.muted} variant="caption">
                {t('Aucune partition liée.')}
              </AppText>
            ) : null}
            {documentError ? (
              <AppText color={palette.error} variant="caption">
                {documentError}
              </AppText>
            ) : null}
          </Card>
        ) : null}
        {!isNew && activeTab === 'comments' ? (
          <SongCommentsPanel
            comments={comments}
            draft={commentDraft}
            groupId={group.id}
            inputRef={commentInputRef}
            isLeader={isLeader}
            onComposerBlur={() => {
              commentInputFocusedRef.current = false;
            }}
            onComposerFocus={revealCommentComposer}
            onDraftChange={setCommentDraft}
            songId={draft.id}
            userId={userId}
          />
        ) : null}
        {canEdit && isNew ? (
          <DispoButton
            disabled={!draft.title.trim()}
            loading={saveRepertoire.isPending || saveSetlist.isPending}
            onPress={submit}
          >
            {isNew
              ? isLeader
                ? t('Ajouter au répertoire')
                : t('Envoyer la suggestion')
              : t('Enregistrer le morceau')}
          </DispoButton>
        ) : null}
        {!isNew && activeTab === 'info' ? (
          <DispoButton
            icon="copy-outline"
            onPress={() =>
              router.push({
                params: {
                  id: group.id,
                  songId: draft.id,
                  ...(sourceEvent ? { sourceEventId: sourceEvent.id } : {}),
                },
                pathname: '/groups/[id]/songs/[songId]/copy',
              } as never)
            }
            variant="secondary"
          >
            {t('Copier le morceau')}
          </DispoButton>
        ) : null}
        {!isNew && isLeader && activeTab === 'info' ? (
          <DispoButton onPress={removeSong} variant="danger">
            {sourceEvent ? t('Retirer') : t('Retirer du répertoire')}
          </DispoButton>
        ) : null}
        {saveRepertoire.error || saveSetlist.error ? (
          <AppText color={palette.error} style={styles.center} variant="caption">
            {t('Le morceau n’a pas pu être enregistré. Il est peut-être déjà dans le répertoire.')}
          </AppText>
        ) : null}
      </SongKeyboardScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  center: { textAlign: 'center' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  documentActions: { gap: spacing.xs },
  flex: { flex: 1 },
  soloActions: { alignItems: 'center', flexDirection: 'row' },
  soloCopy: { flex: 1, minWidth: 0 },
  soloEmpty: { paddingVertical: spacing.xs, textAlign: 'center' },
  soloIndex: { minWidth: 18, textAlign: 'right' },
  soloList: { gap: spacing.xs },
  soloRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
