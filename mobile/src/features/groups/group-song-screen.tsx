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
  ActivityIndicator,
  Alert,
  Dimensions,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { analyzeSongPreview } from '../../../modules/dispo-song-analysis';

import type { GroupSong, GroupSongComment } from './group-model';
import {
  useDeleteGroupDocument,
  useDeleteSongComment,
  useGroup,
  useSaveEventSetlist,
  useSaveGroupRepertoire,
  useSongComment,
  useUploadGroupDocument,
} from './group-queries';
import {
  enrichSongCatalogResult,
  openGroupDocument,
  searchSongCatalog,
  type SongCatalogResult,
} from './group-repository';
import { isKnownMusicalKey, musicalKeyOptions, musicalKeysEqual } from './group-song-key-model';
import { SongArtwork, SongListenSheet } from './group-song-row';
import { SongDetailTabs, type SongDetailTab } from './song-detail-tabs';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { irealDestination } from '@/domain/song';
import { useAuth } from '@/features/auth/auth-context';
import { ReceiptChecks } from '@/features/messages/message-controls';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, spacing } from '@/theme/tokens';

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

function mergeCatalogEnrichment(song: GroupSong, item: SongCatalogResult): GroupSong {
  return {
    ...song,
    albumTitle: item.albumTitle,
    artworkUrl: item.artworkUrl,
    canonicalSongId: item.canonicalSongId,
    composer: item.composer,
    durationMilliseconds: item.durationMilliseconds,
    genre: item.genre,
    genres: item.genres,
    isrc: item.isrc,
    key: song.key?.trim() ? song.key : item.key,
    metadataSource: item.metadataSource,
    metadataUpdatedAt: item.metadataUpdatedAt,
    platformIds: item.platformIds,
    platformLinks: item.platformLinks,
    previewUrl: item.previewUrl,
    releaseYear: item.releaseYear,
    tempoBpm: song.tempoBpm ?? item.tempoBpm,
    trackUrl: item.trackUrl,
  };
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
  const { palette } = useDispoTheme();
  const query = useGroup(groupId);
  const saveRepertoire = useSaveGroupRepertoire();
  const saveSetlist = useSaveEventSetlist();
  const comment = useSongComment();
  const deleteComment = useDeleteSongComment();
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
  const [blankSong] = useState<GroupSong>(() => emptySong(userId, false));
  const [draftOverride, setDraftOverride] = useState<GroupSong | null>(null);
  const [catalogTerm, setCatalogTerm] = useState('');
  const [catalogResults, setCatalogResults] = useState<SongCatalogResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogAnalyzing, setCatalogAnalyzing] = useState(false);
  const analysisRequestRef = useRef(0);
  const enrichedExistingRef = useRef(new Set<string>());
  const [activeTab, setActiveTab] = useState<SongDetailTab>('info');
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);
  const commentInputFocusedRef = useRef(false);
  const revealCommentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listenVisible, setListenVisible] = useState(false);
  const [soloPickerVisible, setSoloPickerVisible] = useState(false);
  const [documentInstrument, setDocumentInstrument] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
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
  const selectableSoloMembers = useMemo(
    () => group?.members.filter((member) => !draft.solos.includes(member.id)) ?? [],
    [draft.solos, group?.members],
  );
  const documentInstruments = useMemo(
    () =>
      [...new Set(group?.members.flatMap((member) => member.instruments) ?? [])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [group?.members],
  );

  useEffect(() => {
    const term = catalogTerm.trim();
    if (!isNew || term.length < 2) return;
    let active = true;
    const timeout = setTimeout(() => {
      setCatalogLoading(true);
      void searchSongCatalog(term)
        .then((results) => {
          if (active) setCatalogResults(results);
        })
        .catch(() => {
          if (active) setCatalogResults([]);
        })
        .finally(() => {
          if (active) setCatalogLoading(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [catalogTerm, isNew]);

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
  if (!group || (!isNew && !existing))
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Ce morceau n’est plus accessible.')} />
      </Screen>
    );
  const canEdit = isNew || isLeader;
  const updateCatalogTerm = (value: string) => {
    setCatalogTerm(value);
    if (value.trim().length < 2) {
      setCatalogResults([]);
      setCatalogLoading(false);
    }
  };
  const patch = <K extends keyof GroupSong>(key: K, value: GroupSong[K]) =>
    setDraftOverride((current) => ({ ...(current ?? baseDraft), [key]: value }));
  const chooseCatalog = (item: SongCatalogResult) => {
    const analysisRequest = ++analysisRequestRef.current;
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
    if (!item.previewUrl) {
      setCatalogAnalyzing(false);
    } else {
      setCatalogAnalyzing(true);
      void analyzeSongPreview(item.previewUrl)
        .then((analysis) => {
          setDraftOverride((current) => {
            const source = current ?? baseDraft;
            if (
              analysisRequestRef.current !== analysisRequest ||
              source.catalogId !== item.catalogId
            )
              return source;
            return {
              ...source,
              key: source.key?.trim() ? source.key : analysis.key,
              tempoBpm: source.tempoBpm ?? analysis.tempoBpm,
            };
          });
        })
        .finally(() => {
          if (analysisRequestRef.current === analysisRequest) setCatalogAnalyzing(false);
        });
    }
    void enrichSongCatalogResult(item)
      .then(({ refreshed }) => {
        if (!refreshed || analysisRequestRef.current !== analysisRequest) return;
        setDraftOverride((current) => {
          const source = current ?? baseDraft;
          if (source.catalogId !== item.catalogId) return source;
          return mergeCatalogEnrichment(source, refreshed);
        });
      })
      .catch(() => {
        // Les liens connus restent visibles si l'enrichissement réseau échoue.
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
  const moveSolo = (index: number, offset: number) => {
    const destination = index + offset;
    if (destination < 0 || destination >= draft.solos.length) return;
    const next = [...draft.solos];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    void Haptics.selectionAsync();
    patch('solos', next);
  };
  const confirmCommentDeletion = (item: GroupSongComment) => {
    Alert.alert(t('Supprimer ce commentaire ?'), t('Cette action est définitive.'), [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => {
          setCommentError(null);
          deleteComment.mutate(item, {
            onError: () => setCommentError(t("Le commentaire n'a pas pu être supprimé. Réessaie.")),
          });
        },
        style: 'destructive',
        text: t('Supprimer'),
      },
    ]);
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
              <Card style={styles.card}>
                <AppText variant="title">{t('Catalogue musical')}</AppText>
                <View style={styles.searchRow}>
                  <View style={styles.flex}>
                    <FormField
                      label={t('Chercher')}
                      onChangeText={updateCatalogTerm}
                      placeholder={t('Titre ou artiste')}
                      returnKeyType="search"
                      value={catalogTerm}
                    />
                  </View>
                  <View style={[styles.searchButton, { backgroundColor: palette.inset }]}>
                    {catalogLoading ? (
                      <ActivityIndicator color={palette.electric} />
                    ) : (
                      <Ionicons color={palette.muted} name="search" size={19} />
                    )}
                  </View>
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
                        draft.catalogId === item.catalogId
                          ? 'checkmark-circle'
                          : 'add-circle-outline'
                      }
                      size={21}
                    />
                  </Pressable>
                ))}
                {catalogAnalyzing ? (
                  <View accessibilityLiveRegion="polite" style={styles.analysisRow}>
                    <ActivityIndicator color={palette.electric} size="small" />
                    <AppText color={palette.muted} variant="caption">
                      {t('Analyse de la tonalité…')}
                    </AppText>
                  </View>
                ) : null}
              </Card>
            ) : null}
            <Card style={styles.card}>
              <SectionHeader subtitle={group.name} title={t('Identité')} />
              <View style={styles.songHero}>
                <SongArtwork artworkUrl={draft.artworkUrl} radius={10} size={54} />
                <View style={styles.heroCopy}>
                  <AppText numberOfLines={2} style={styles.heroTitle} variant="title3">
                    {draft.title || t('Titre')}
                  </AppText>
                  {arrangement.length ? (
                    <View
                      style={[styles.arrangementChip, { backgroundColor: `${palette.bronze}1F` }]}
                    >
                      <Ionicons color={palette.bronze} name="speedometer-outline" size={10} />
                      <AppText
                        color={palette.bronze}
                        style={styles.arrangementText}
                        variant="caption2"
                      >
                        {arrangement.join(' · ')}
                      </AppText>
                    </View>
                  ) : null}
                  {draft.artist ? (
                    <AppText color={palette.muted} numberOfLines={1} variant="caption">
                      {draft.artist}
                    </AppText>
                  ) : null}
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
              <SectionHeader
                subtitle={t('Arrangement partagé avec le groupe')}
                title={t('Repères')}
              />
              <AppText color={palette.bronze} variant="label">
                {t('Tonalité')}
              </AppText>
              {draft.key?.trim() && !isKnownMusicalKey(draft.key) ? (
                <AppText color={palette.muted} variant="caption">
                  {t('Tonalité')} : {draft.key}
                </AppText>
              ) : null}
              {canEdit ? (
                <View style={styles.wrap}>
                  <ChoiceChip
                    label={t('Non renseignée')}
                    onPress={() => patch('key', null)}
                    selected={!draft.key?.trim()}
                  />
                  {musicalKeyOptions.map((key) => (
                    <ChoiceChip
                      key={key}
                      label={key}
                      onPress={() => patch('key', key)}
                      selected={musicalKeysEqual(draft.key, key)}
                    />
                  ))}
                </View>
              ) : (
                <Tag color={palette.bronze} label={draft.key?.trim() || t('Non renseignée')} />
              )}
              <FormField
                editable={canEdit}
                keyboardType="number-pad"
                label={t('Tempo BPM')}
                onChangeText={(value) => patch('tempoBpm', Number.parseInt(value, 10) || null)}
                value={draft.tempoBpm?.toString() ?? ''}
              />
              <FormField
                editable={canEdit}
                label={t('Forme')}
                onChangeText={(value) => patch('form', value.trim() || null)}
                placeholder={t('AABA, ABAB…')}
                value={draft.form ?? ''}
              />
            </Card>
            <DispoButton disabled={!ireal} icon="open-outline" onPress={() => void openIReal()}>
              {t('Ouvrir dans iReal Pro')}
            </DispoButton>
          </>
        ) : null}
        {!isNew && activeTab === 'solos' ? (
          <Card style={styles.card}>
            <SectionHeader
              subtitle={t(
                'Ajoute les musicien·nes dans leur ordre de passage — tout le groupe verra la même liste.',
              )}
              title={t('Solos')}
            />
            {draft.solos.length === 0 ? (
              <AppText color={palette.muted} style={styles.soloEmpty} variant="subheadline">
                {t('Aucun solo prévu')}
              </AppText>
            ) : (
              <View style={styles.soloList}>
                {draft.solos.map((memberId, index) => {
                  const member = group.members.find((item) => item.id === memberId);
                  return (
                    <View key={memberId} style={[styles.soloRow, { borderColor: palette.border }]}>
                      <View style={[styles.soloIndex, { backgroundColor: palette.inset }]}>
                        <AppText style={styles.bold} variant="caption">
                          {index + 1}
                        </AppText>
                      </View>
                      <Avatar
                        name={member?.name ?? memberId}
                        size={34}
                        uri={member?.photoUrl ?? null}
                      />
                      <View style={styles.soloCopy}>
                        <AppText numberOfLines={1} style={styles.bold}>
                          {member?.name ?? memberId}
                        </AppText>
                        {member?.instruments.length ? (
                          <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                            {member.instruments.map((instrument) => t(instrument)).join(' · ')}
                          </AppText>
                        ) : null}
                      </View>
                      {isLeader ? (
                        <View style={styles.soloActions}>
                          <Pressable
                            accessibilityLabel={t('Monter')}
                            accessibilityRole="button"
                            disabled={index === 0}
                            onPress={() => moveSolo(index, -1)}
                            style={[styles.iconAction, index === 0 && styles.disabledAction]}
                          >
                            <Ionicons color={palette.text} name="chevron-up" size={17} />
                          </Pressable>
                          <Pressable
                            accessibilityLabel={t('Descendre')}
                            accessibilityRole="button"
                            disabled={index === draft.solos.length - 1}
                            onPress={() => moveSolo(index, 1)}
                            style={[
                              styles.iconAction,
                              index === draft.solos.length - 1 && styles.disabledAction,
                            ]}
                          >
                            <Ionicons color={palette.text} name="chevron-down" size={17} />
                          </Pressable>
                          <Pressable
                            accessibilityLabel={t('Retirer ce solo')}
                            accessibilityRole="button"
                            onPress={() =>
                              patch(
                                'solos',
                                draft.solos.filter((id) => id !== memberId),
                              )
                            }
                            style={styles.iconAction}
                          >
                            <Ionicons color={palette.signal} name="close" size={17} />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
            {isLeader ? (
              <>
                {selectableSoloMembers.length > 0 ? (
                  <DispoButton
                    icon={soloPickerVisible ? 'chevron-up' : 'add'}
                    onPress={() => setSoloPickerVisible((visible) => !visible)}
                    variant="secondary"
                  >
                    {t('Ajouter un solo')}
                  </DispoButton>
                ) : null}
                {soloPickerVisible ? (
                  <View style={styles.soloCandidates}>
                    {selectableSoloMembers.map((member) => (
                      <Pressable
                        accessibilityRole="button"
                        key={member.id}
                        onPress={() => patch('solos', [...draft.solos, member.id])}
                        style={({ pressed }) => [
                          styles.soloCandidate,
                          { borderBottomColor: palette.border },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Avatar name={member.name} size={36} uri={member.photoUrl} />
                        <View style={styles.soloCopy}>
                          <AppText numberOfLines={1} style={styles.bold}>
                            {member.name}
                          </AppText>
                          {member.instruments.length ? (
                            <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                              {member.instruments.map((instrument) => t(instrument)).join(' · ')}
                            </AppText>
                          ) : null}
                        </View>
                        <Ionicons color={palette.electric} name="add-circle" size={22} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}
        {!isNew && activeTab === 'documents' ? (
          <Card style={styles.card}>
            <SectionHeader subtitle={t('Partitions liées au morceau')} title={t('Documents')} />
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
              <View
                key={document.id}
                style={[styles.documentRow, { borderBottomColor: palette.border }]}
              >
                <Pressable onPress={() => void openDocument(document)} style={styles.documentOpen}>
                  <Ionicons color={palette.electric} name="document-text" size={18} />
                  <View style={styles.flex}>
                    <AppText style={styles.bold}>{document.title}</AppText>
                    <AppText color={palette.muted} variant="caption2">
                      {document.extension.toUpperCase()}
                      {document.instrument ? ` · ${t(document.instrument)}` : ''}
                    </AppText>
                  </View>
                </Pressable>
                {isLeader || document.addedById === userId ? (
                  <Pressable
                    accessibilityLabel={t('Supprimer le document')}
                    accessibilityRole="button"
                    onPress={() =>
                      deleteDocument.mutate(document, {
                        onError: () =>
                          setDocumentError(
                            t("L'action n'a pas pu être enregistrée. Réessaie dans un instant."),
                          ),
                      })
                    }
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
            {documentError ? (
              <AppText color={palette.signal} variant="caption">
                {documentError}
              </AppText>
            ) : null}
          </Card>
        ) : null}
        {!isNew && activeTab === 'comments' ? (
          <Card style={styles.card}>
            <SectionHeader subtitle={t('Notes du groupe')} title={t('Commentaires')} />
            {comments.map((item) => (
              <View key={item.id} style={styles.commentRow}>
                <Avatar name={item.authorName} size={30} />
                <View style={styles.commentCopy}>
                  <AppText style={styles.bold} variant="caption">
                    {item.authorName}
                  </AppText>
                  <AppText>{item.text}</AppText>
                  {item.authorId === userId ? <ReceiptChecks receipt="sent" /> : null}
                </View>
                {isLeader || item.authorId === userId ? (
                  <Pressable
                    accessibilityLabel={t('Supprimer')}
                    accessibilityRole="button"
                    disabled={deleteComment.isPending}
                    onPress={() => confirmCommentDeletion(item)}
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
                  ref={commentInputRef}
                  label={t('Ajouter une note')}
                  multiline
                  numberOfLines={3}
                  onBlur={() => {
                    commentInputFocusedRef.current = false;
                  }}
                  onChangeText={setCommentText}
                  onFocus={revealCommentComposer}
                  onPressIn={revealCommentComposer}
                  placeholder={t('Intro, fin, consigne…')}
                  style={styles.commentInput}
                  value={commentText}
                />
              </View>
              <Pressable
                accessibilityLabel={t('Envoyer')}
                accessibilityRole="button"
                disabled={!commentText.trim() || comment.isPending}
                onPress={() => {
                  setCommentError(null);
                  comment.mutate(
                    { groupId: group.id, songId: draft.id, text: commentText },
                    {
                      onError: () =>
                        setCommentError(t("Le commentaire n'a pas pu être enregistré. Réessaie.")),
                      onSuccess: () => setCommentText(''),
                    },
                  );
                }}
                style={[styles.searchButton, { backgroundColor: palette.electric }]}
              >
                <Ionicons color="#050814" name="arrow-up" size={18} />
              </Pressable>
            </View>
            {commentError ? (
              <AppText accessibilityLiveRegion="polite" color={palette.error} variant="caption">
                {commentError}
              </AppText>
            ) : null}
          </Card>
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
  analysisRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
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
  commentCopy: { flex: 1, gap: spacing.xxxs },
  commentInput: { minHeight: 84, textAlignVertical: 'top' },
  commentRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  documentOpen: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minimumTouchTarget,
  },
  documentActions: { gap: spacing.xs },
  documentRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  editorFields: { gap: spacing.sm },
  disabledAction: { opacity: 0.28 },
  fieldsRow: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  heroAction: {
    alignItems: 'center',
    borderRadius: 18,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  heroCopy: { flex: 1, gap: spacing.xxxs, minWidth: 0 },
  heroTitle: { fontSize: 19, lineHeight: 23 },
  iconAction: {
    alignItems: 'center',
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  pressed: { opacity: 0.72 },
  searchButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: minimumTouchTarget,
    justifyContent: 'center',
    marginBottom: 3,
    width: minimumTouchTarget,
  },
  searchRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs },
  soloIndex: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  soloActions: { alignItems: 'center', flexDirection: 'row' },
  soloCandidate: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 52,
    paddingVertical: spacing.xs,
  },
  soloCandidates: { gap: spacing.xxxs },
  soloCopy: { flex: 1, minWidth: 0 },
  soloEmpty: { paddingVertical: spacing.xs, textAlign: 'center' },
  soloList: { gap: spacing.xs },
  soloRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minimumTouchTarget,
    paddingLeft: spacing.xs,
  },
  songHero: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
