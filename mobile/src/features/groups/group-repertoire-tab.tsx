import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { GroupDocument, GroupSong, MusicGroup } from './group-model';
import {
  useDeleteGroupDocument,
  useReorderGroupRepertoire,
  useSaveGroupRepertoire,
  useUploadGroupDocument,
} from './group-queries';
import { openGroupDocument } from './group-repository';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
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
  return (
    <Pressable
      accessibilityHint={t('Un appui long permet de copier le morceau')}
      accessibilityLabel={`${t('Ouvrir')} ${song.title}`}
      accessibilityRole="button"
      onLongPress={() => router.push(`/groups/${group.id}/songs/${song.id}/copy` as never)}
      onPress={() => router.push(`/groups/${group.id}/songs/${song.id}` as never)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={12}>
        <View style={styles.songRow}>
          <View style={[styles.songNumber, { backgroundColor: `${palette.bronze}22` }]}>
            <AppText color={palette.bronze} style={styles.songNumberText}>
              {index + 1}
            </AppText>
          </View>
          <View style={styles.songCopy}>
            <AppText numberOfLines={1} style={styles.songTitle}>
              {song.title}
            </AppText>
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {song.artist}
            </AppText>
            <View style={styles.tags}>
              {song.key ? <Tag color={palette.electric} label={song.key} /> : null}
              {song.tempoBpm ? <Tag color={palette.bronze} label={`${song.tempoBpm} BPM`} /> : null}
              {song.form ? <Tag color={palette.jam} label={song.form} /> : null}
              {song.solos.length ? (
                <Tag
                  color={palette.rehearsal}
                  label={t('{{count}} solos', { count: song.solos.length })}
                />
              ) : null}
            </View>
          </View>
          {isLeader ? (
            <View style={styles.orderButtons}>
              <Pressable
                accessibilityLabel={t('Monter')}
                disabled={index === 0}
                onPress={() => move(-1)}
              >
                <Ionicons
                  color={index === 0 ? palette.border : palette.bronze}
                  name="chevron-up"
                  size={20}
                />
              </Pressable>
              <Pressable
                accessibilityLabel={t('Descendre')}
                disabled={index === total - 1}
                onPress={() => move(1)}
              >
                <Ionicons
                  color={index === total - 1 ? palette.border : palette.bronze}
                  name="chevron-down"
                  size={20}
                />
              </Pressable>
            </View>
          ) : (
            <Ionicons color={palette.muted} name="chevron-forward" size={16} />
          )}
        </View>
      </Card>
    </Pressable>
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
    <Card padding={12} style={{ borderColor: `${palette.signal}55` }}>
      <View style={styles.pendingTop}>
        <View style={styles.songCopy}>
          <AppText style={styles.songTitle}>{song.title}</AppText>
          <AppText color={palette.muted} variant="caption">
            {song.artist}
          </AppText>
          <AppText color={palette.bronze} variant="caption2">
            {t('Suggestion d’un membre')}
          </AppText>
        </View>
        <Tag color={palette.signal} label={t('À valider')} />
      </View>
      <View style={styles.pendingActions}>
        <View style={styles.flex}>
          <DispoButton disabled={save.isPending} icon="checkmark" onPress={() => decide(true)}>
            {t('Accepter')}
          </DispoButton>
        </View>
        <View style={styles.flex}>
          <DispoButton disabled={save.isPending} onPress={() => decide(false)} variant="secondary">
            {t('Refuser')}
          </DispoButton>
        </View>
      </View>
    </Card>
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
        <Pressable onPress={() => void openGroupDocument(document)} style={styles.songCopy}>
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
      <View style={styles.sectionHeading}>
        <SectionHeader
          subtitle={t('{{count}} morceaux validés', {
            count: group.repertoire.filter((song) => song.isApproved).length,
          })}
          title={t('Répertoire')}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/groups/${group.id}/songs/new` as never)}
          style={[styles.addButton, { backgroundColor: `${palette.electric}20` }]}
        >
          <Ionicons color={palette.electric} name="add-circle" size={18} />
          <AppText color={palette.electric} style={styles.addLabel}>
            {isLeader ? t('Ajouter') : t('Suggérer')}
          </AppText>
        </Pressable>
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
      {group.repertoire.filter((song) => song.isApproved).length > 8 ? (
        <FormField
          label={t('Chercher un morceau')}
          onChangeText={setSearch}
          placeholder={t('Titre ou artiste')}
          value={search}
        />
      ) : null}
      {approved.length ? (
        approved.map((song, index) => (
          <SongCard
            group={group}
            index={index}
            isLeader={isLeader}
            key={song.id}
            song={song}
            total={approved.length}
          />
        ))
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
    borderRadius: radii.round,
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addLabel: { fontSize: 13, fontWeight: '800' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  documentIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  documentRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.control },
  documentTitle: { fontWeight: '700' },
  empty: { alignItems: 'center', gap: spacing.xs, padding: spacing.xl },
  emptyText: { textAlign: 'center' },
  flex: { flex: 1 },
  iconButton: {
    alignItems: 'center',
    borderRadius: 19,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  orderButtons: { gap: spacing.xs },
  pendingActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  pendingTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  pressed: { opacity: 0.76 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  songCopy: { flex: 1, gap: 2 },
  songNumber: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  songNumberText: { fontFamily: 'SplineSansMonoSemibold', fontSize: 12 },
  songRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.control },
  songTitle: { fontWeight: '800' },
  stack: { gap: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs, marginTop: spacing.xxs },
});
