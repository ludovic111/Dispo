import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { type GroupDocument, type GroupSong, type MusicGroup } from './group-model';
import {
  useDeleteGroupDocument,
  useReorderGroupRepertoire,
  useSaveGroupRepertoire,
  useUploadGroupDocument,
} from './group-queries';
import { openGroupDocument } from './group-repository';
import { GroupSongRow } from './group-song-row';
import { SongReorderList } from './song-reorder-list';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

function SongCard({ group, song }: { group: MusicGroup; song: GroupSong }) {
  return (
    <GroupSongRow
      onPress={() => router.push(`/groups/${group.id}/songs/${song.id}` as never)}
      members={group.members}
      song={song}
    />
  );
}

function PendingSongCard({ group, song }: { group: MusicGroup; song: GroupSong }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const save = useSaveGroupRepertoire();
  const decide = (approved: boolean) => {
    const desired = approved
      ? group.repertoire.map((item) => (item.id === song.id ? { ...item, isApproved: true } : item))
      : group.repertoire.filter((item) => item.id !== song.id);
    save.mutate({ desired, groupId: group.id, original: group.repertoire });
  };
  return (
    <GroupSongRow
      cardStyle={{ borderColor: `${palette.signal}55` }}
      members={group.members}
      onPress={() => router.push(`/groups/${group.id}/songs/${song.id}` as never)}
      showDisclosure={false}
      showListenAction={false}
      showSoloAction={false}
      song={song}
      trailing={
        <View style={styles.pendingActions}>
          <Pressable
            accessibilityLabel={t('Accepter')}
            accessibilityRole="button"
            accessibilityState={{ disabled: save.isPending }}
            disabled={save.isPending}
            onPress={() => decide(true)}
            style={styles.songActionButton}
          >
            <Ionicons color={palette.jam} name="checkmark-circle" size={24} />
          </Pressable>
          <Pressable
            accessibilityLabel={t('Refuser')}
            accessibilityRole="button"
            accessibilityState={{ disabled: save.isPending }}
            disabled={save.isPending}
            onPress={() => decide(false)}
            style={styles.songActionButton}
          >
            <Ionicons color={palette.muted} name="close-circle" size={24} />
          </Pressable>
        </View>
      }
    />
  );
}

function DocumentRow({ canDelete, document }: { canDelete: boolean; document: GroupDocument }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const remove = useDeleteGroupDocument();
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await openGroupDocument(document);
    } catch {
      Alert.alert(t("La partition n'a pas pu être ouverte — vérifie le réseau."));
    } finally {
      setOpening(false);
    }
  };
  return (
    <Card padding={11}>
      <View style={styles.documentRow}>
        <View style={[styles.documentIcon, { backgroundColor: `${palette.electric}20` }]}>
          <Ionicons color={palette.electric} name="document-text" size={18} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: opening, disabled: opening }}
          disabled={opening}
          onPress={() => void open()}
          style={styles.documentOpen}
        >
          <AppText numberOfLines={1} style={styles.documentTitle}>
            {document.title}
          </AppText>
          <AppText color={palette.muted} variant="caption2">
            {document.extension.toUpperCase()}
            {document.addedBy ? ` · ${document.addedBy}` : ''}
          </AppText>
        </Pressable>
        {canDelete ? (
          <Pressable
            accessibilityLabel={t('Supprimer le document')}
            accessibilityRole="button"
            onPress={() =>
              Alert.alert(t('Supprimer le document ?'), undefined, [
                { style: 'cancel', text: t('Annuler') },
                {
                  onPress: () => remove.mutate(document),
                  style: 'destructive',
                  text: t('Supprimer'),
                },
              ])
            }
            style={styles.documentAction}
          >
            <Ionicons color={palette.signal} name="trash-outline" size={18} />
          </Pressable>
        ) : (
          <Ionicons color={palette.muted} name="eye-outline" size={17} />
        )}
      </View>
    </Card>
  );
}

export function GroupRepertoireTab({ group, userId }: { group: MusicGroup; userId: string }) {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const upload = useUploadGroupDocument();
  const reorder = useReorderGroupRepertoire();
  const [search, setSearch] = useState('');
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const isLeader = group.leaderId === userId;
  const approvedSongs = group.repertoire.filter((song) => song.isApproved);
  const searchActive = Boolean(search.trim());
  const reorderActive = reorderMode && isLeader && !searchActive;
  const approved = useMemo(() => {
    const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
    const needle = search.trim().toLocaleLowerCase(locale);
    return approvedSongs.filter(
      (song) =>
        !needle || `${song.title} ${song.artist}`.toLocaleLowerCase(locale).includes(needle),
    );
  }, [approvedSongs, i18n.language, i18n.resolvedLanguage, search]);
  const pending = group.repertoire.filter((song) => !song.isApproved);
  const looseDocuments = group.documents.filter((document) => document.songId === null);
  const pickDocument = async () => {
    setDocumentError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'],
      });
      const asset = result.assets?.[0];
      if (!asset || !session?.user.id) return;
      upload.mutate(
        {
          contentType: asset.mimeType ?? 'application/octet-stream',
          extension: asset.name.split('.').pop() ?? 'pdf',
          groupId: group.id,
          instrument: null,
          songId: null,
          title: asset.name.replace(/\.[^.]+$/, ''),
          uri: asset.uri,
          userId: session.user.id,
        },
        {
          onError: () =>
            setDocumentError(t("La partition n'a pas pu être envoyée — vérifie le réseau.")),
        },
      );
    } catch {
      setDocumentError(t("Le document n'a pas pu être importé."));
    }
  };
  if (reorderActive) {
    return (
      <SongReorderList
        title={t('Répertoire')}
        songs={approvedSongs}
        onDone={() => setReorderMode(false)}
        onSave={(songIds) => reorder.mutateAsync({ groupId: group.id, songIds })}
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionHeader
        subtitle={t('{{count}} morceaux validés', { count: approvedSongs.length })}
        title={t('Répertoire')}
      />
      <View style={styles.primaryActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/groups/${group.id}/songs/new` as never)}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: `${palette.electric}1F` },
            pressed && styles.addPressed,
          ]}
        >
          <Ionicons color={palette.electric} name="add-circle" size={18} />
          <AppText color={palette.electric} style={styles.addLabel}>
            {isLeader ? t('Ajouter') : t('Suggérer')}
          </AppText>
        </Pressable>
        {isLeader && approvedSongs.length > 1 ? (
          <Pressable
            accessibilityLabel={reorderMode ? t('Terminé') : t('Réorganiser')}
            accessibilityRole="button"
            accessibilityState={{ selected: reorderMode, disabled: searchActive }}
            disabled={searchActive}
            onPress={() => {
              if (!searchActive) setReorderMode(true);
            }}
            style={({ pressed }) => [
              styles.reorderButton,
              {
                backgroundColor: reorderMode ? `${palette.jam}1F` : palette.inset,
                borderColor: reorderMode ? `${palette.jam}66` : palette.border,
              },
              (pressed || searchActive) && { opacity: 0.4 },
            ]}
          >
            <Ionicons
              color={reorderMode ? palette.jam : palette.bronze}
              name={reorderMode ? 'checkmark' : 'reorder-three'}
              size={18}
            />
            <AppText color={reorderMode ? palette.jam : palette.bronze} style={styles.addLabel}>
              {reorderMode ? t('Terminé') : t('Réorganiser')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {isLeader && pending.length ? (
        <View style={styles.stack}>
          <AppText color={palette.signal} variant="label">
            {t('Suggestions à valider')}
          </AppText>
          {pending.map((song) => (
            <PendingSongCard group={group} key={song.id} song={song} />
          ))}
        </View>
      ) : null}
      {approvedSongs.length > 8 && !reorderActive ? (
        <View style={[styles.search, { backgroundColor: palette.inset }]}>
          <Ionicons color={palette.muted} name="search" size={15} />
          <TextInput
            accessibilityLabel={t('Chercher un morceau')}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearch}
            placeholder={t('Titre ou artiste')}
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            style={[styles.searchInput, { color: palette.text }]}
            value={search}
          />
          {search ? (
            <Pressable
              accessibilityLabel={t('Effacer')}
              accessibilityRole="button"
              onPress={() => setSearch('')}
              style={styles.searchClear}
            >
              <Ionicons color={palette.muted} name="close-circle" size={16} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {approved.length ? (
        approved.map((song) => <SongCard group={group} key={song.id} song={song} />)
      ) : (
        <View style={styles.empty}>
          <Ionicons color={palette.bronze} name="musical-notes-outline" size={34} />
          <AppText variant="title">{t('Aucun morceau')}</AppText>
          <AppText color={palette.muted} style={styles.emptyText}>
            {t('Ajoute le premier titre joué par le groupe.')}
          </AppText>
        </View>
      )}
      <View style={styles.sectionHeading}>
        <SectionHeader subtitle={t('PDF, grilles et partitions libres')} title={t('Documents')} />
        <Pressable
          accessibilityLabel={t('Ajouter un document')}
          accessibilityRole="button"
          onPress={() => void pickDocument()}
          style={[styles.iconButton, { borderColor: palette.border }]}
        >
          <Ionicons color={palette.electric} name="add" size={20} />
        </Pressable>
      </View>
      {looseDocuments.map((document) => (
        <DocumentRow
          canDelete={isLeader || document.addedById === userId}
          document={document}
          key={document.id}
        />
      ))}
      {documentError ? (
        <AppText color={palette.error} style={styles.emptyText} variant="caption">
          {documentError}
        </AppText>
      ) : null}
      {!looseDocuments.length ? (
        <AppText color={palette.muted} style={styles.emptyText} variant="caption">
          {t('Aucun document libre pour l’instant.')}
        </AppText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.tight,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flex: 1,
  },
  addPressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  addLabel: { fontSize: 13, fontWeight: '800' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  documentIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  documentAction: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  documentOpen: { flex: 1, gap: 2, justifyContent: 'center', minHeight: 44 },
  documentRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.control },
  documentTitle: { fontWeight: '700' },
  empty: { alignItems: 'center', gap: spacing.xs, padding: spacing.xl },
  emptyText: { textAlign: 'center' },
  iconButton: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pendingActions: { flexDirection: 'row', gap: spacing.xxs },
  primaryActions: { flexDirection: 'row', gap: spacing.xs },
  reorderButton: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.tight,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  search: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.chip,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  searchClear: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  songActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  stack: { gap: spacing.xs },
});
