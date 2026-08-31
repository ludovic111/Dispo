import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { GroupDocument, GroupSong, MusicGroup } from './group-model';
import {
  useDeleteGroupDocument,
  useReorderGroupRepertoire,
  useSaveGroupRepertoire,
  useUploadGroupDocument,
} from './group-queries';
import { openGroupDocument } from './group-repository';
import { GroupSongRow } from './group-song-row';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

function SongCard({
  group,
  index,
  isLeader,
  song,
  total,
}: {
  group: MusicGroup;
  index: number;
  isLeader: boolean;
  song: GroupSong;
  total: number;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const reorder = useReorderGroupRepertoire();
  const approved = group.repertoire.filter((item) => item.isApproved);
  const move = (offset: -1 | 1) => {
    const next = [...approved];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate({ groupId: group.id, songIds: next.map((item) => item.id) });
  };
  const chooseMove = () => {
    const actions: Parameters<typeof Alert.alert>[2] = [];
    if (index > 0) actions.push({ onPress: () => move(-1), text: t('Monter') });
    if (index < total - 1) actions.push({ onPress: () => move(1), text: t('Descendre') });
    actions.push({ style: 'cancel', text: t('Annuler') });
    Alert.alert(t('Déplacer le morceau'), song.title, actions);
  };
  return (
    <GroupSongRow
      accessibilityHint={t('Un appui long permet de copier le morceau')}
      onLongPress={() => router.push(`/groups/${group.id}/songs/${song.id}/copy` as never)}
      onPress={() => router.push(`/groups/${group.id}/songs/${song.id}` as never)}
      song={song}
      trailing={
        isLeader ? (
          <Pressable
            accessibilityLabel={t('Déplacer le morceau')}
            accessibilityRole="button"
            accessibilityState={{ disabled: total < 2 || reorder.isPending }}
            disabled={total < 2 || reorder.isPending}
            onPress={chooseMove}
            style={styles.songActionButton}
          >
            <Ionicons
              color={reorder.isPending ? palette.border : palette.bronze}
              name="swap-vertical"
              size={18}
            />
          </Pressable>
        ) : null
      }
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
      onPress={() => router.push(`/groups/${group.id}/songs/${song.id}` as never)}
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

function DocumentRow({ document, isLeader }: { document: GroupDocument; isLeader: boolean }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const remove = useDeleteGroupDocument();
  return (
    <Card padding={11}>
      <View style={styles.documentRow}>
        <View style={[styles.documentIcon, { backgroundColor: `${palette.electric}20` }]}>
          <Ionicons color={palette.electric} name="document-text" size={18} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void openGroupDocument(document)}
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
        {isLeader ? (
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
  const [search, setSearch] = useState('');
  const isLeader = group.leaderId === userId;
  const approvedSongs = group.repertoire.filter((song) => song.isApproved);
  const approved = useMemo(() => {
    const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
    const needle = search.trim().toLocaleLowerCase(locale);
    return group.repertoire.filter(
      (song) =>
        song.isApproved &&
        (!needle || `${song.title} ${song.artist}`.toLocaleLowerCase(locale).includes(needle)),
    );
  }, [group.repertoire, i18n.language, i18n.resolvedLanguage, search]);
  const pending = group.repertoire.filter((song) => !song.isApproved);
  const looseDocuments = group.documents.filter((document) => document.songId === null);
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.assets?.[0];
    if (!asset || !session?.user.id) return;
    upload.mutate({
      contentType: asset.mimeType ?? 'application/octet-stream',
      extension: asset.name.split('.').pop() ?? 'pdf',
      groupId: group.id,
      instrument: null,
      songId: null,
      title: asset.name.replace(/\.[^.]+$/, ''),
      uri: asset.uri,
      userId: session.user.id,
    });
  };
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionHeader
        subtitle={t('{{count}} morceaux validés', { count: approvedSongs.length })}
        title={t('Répertoire')}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/groups/${group.id}/songs/new` as never)}
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: `${palette.bronze}1F` },
          pressed && styles.addPressed,
        ]}
      >
        <Ionicons color={palette.bronze} name="add-circle" size={18} />
        <AppText color={palette.bronze} style={styles.addLabel}>
          {isLeader ? t('Ajouter') : t('Suggérer')}
        </AppText>
      </Pressable>
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
      {approvedSongs.length > 8 ? (
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
        approved.map((song) => {
          const orderIndex = approvedSongs.findIndex((item) => item.id === song.id);
          return (
            <SongCard
              group={group}
              index={orderIndex}
              isLeader={isLeader}
              key={song.id}
              song={song}
              total={approvedSongs.length}
            />
          );
        })
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
        <DocumentRow document={document} isLeader={isLeader} key={document.id} />
      ))}
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
