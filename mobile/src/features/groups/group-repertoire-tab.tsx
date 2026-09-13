import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

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
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { EmptyState } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { BottomSheet } from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing, tint } from '@/theme/tokens';

function SongCard({ group, song }: { group: MusicGroup; song: GroupSong }) {
  return (
    <GroupSongRow
      onPress={() => router.push(`/groups/${group.id}/songs/${song.id}` as never)}
      members={group.members}
      song={song}
    />
  );
}

/** Suggestion en attente : une seule action visible, la décision passe par une feuille. */
function PendingSongCard({ group, song }: { group: MusicGroup; song: GroupSong }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const save = useSaveGroupRepertoire();
  const [decisionVisible, setDecisionVisible] = useState(false);
  const decide = (approved: boolean) => {
    setDecisionVisible(false);
    const desired = approved
      ? group.repertoire.map((item) => (item.id === song.id ? { ...item, isApproved: true } : item))
      : group.repertoire.filter((item) => item.id !== song.id);
    save.mutate(
      { desired, groupId: group.id, original: group.repertoire },
      { onError: () => Alert.alert(t('La suggestion n’a pas pu être mise à jour.')) },
    );
  };
  return (
    <>
      <GroupSongRow
        cardStyle={{ borderColor: tint(palette.signal, 0.33) }}
        members={group.members}
        onPress={() => router.push(`/groups/${group.id}/songs/${song.id}` as never)}
        showDisclosure={false}
        showListenAction={false}
        showSoloAction={false}
        song={song}
        trailing={
          <IconButton
            accessibilityLabel={t('Suggestion à valider')}
            disabled={save.isPending}
            icon="ellipsis-horizontal"
            onPress={() => setDecisionVisible(true)}
            variant="plain"
          />
        }
      />
      <BottomSheet
        onClose={() => setDecisionVisible(false)}
        title={song.title}
        visible={decisionVisible}
      >
        <View style={styles.decision}>
          <DispoButton icon="checkmark-circle" onPress={() => decide(true)}>
            {t('Accepter')}
          </DispoButton>
          <DispoButton icon="close-circle" onPress={() => decide(false)} variant="danger">
            {t('Refuser')}
          </DispoButton>
        </View>
      </BottomSheet>
    </>
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
    <ListRow
      accessibilityLabel={`${t('Ouvrir')} ${document.title}`}
      accessory={
        canDelete ? (
          <IconButton
            accessibilityLabel={t('Supprimer le document')}
            icon="trash-outline"
            iconColor={palette.error}
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
            variant="plain"
          />
        ) : undefined
      }
      leadingIcon="document-text"
      subtitle={`${document.extension.toUpperCase()}${document.addedBy ? ` · ${document.addedBy}` : ''}`}
      title={document.title}
      {...(opening ? {} : { onPress: () => void open() })}
    />
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
  const addSong = () => router.push(`/groups/${group.id}/songs/new` as never);
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
        {...(isLeader && approvedSongs.length > 1 && !searchActive
          ? {
              action: {
                icon: 'reorder-three' as const,
                label: t('Réorganiser'),
                onPress: () => setReorderMode(true),
              },
            }
          : {})}
      />
      {isLeader ? (
        <DispoButton icon="add" onPress={addSong} size="compact" variant="secondary">
          {t('Ajouter')}
        </DispoButton>
      ) : null}
      {pending.length ? (
        <View style={styles.stack}>
          <SectionHeader
            title={isLeader ? t('Suggestions à valider') : t('En attente du leader')}
          />
          {pending.map((song) =>
            isLeader ? (
              <PendingSongCard group={group} key={song.id} song={song} />
            ) : (
              <SongCard group={group} key={song.id} song={song} />
            ),
          )}
        </View>
      ) : null}
      {approvedSongs.length > 8 ? (
        <FormField
          autoCapitalize="none"
          autoCorrect={false}
          label={t('Chercher un morceau')}
          onChangeText={setSearch}
          placeholder={t('Titre ou artiste')}
          returnKeyType="search"
          value={search}
        />
      ) : null}
      {approved.length ? (
        approved.map((song) => <SongCard group={group} key={song.id} song={song} />)
      ) : (
        <EmptyState
          action={{ label: isLeader ? t('Ajouter') : t('Suggérer un morceau'), onPress: addSong }}
          icon="musical-notes-outline"
          message={
            searchActive
              ? t('Essaie une autre recherche ou un autre style.')
              : t('Ajoute le premier titre joué par le groupe.')
          }
          title={searchActive ? t('Aucun morceau trouvé') : t('Aucun morceau')}
        />
      )}
      {!isLeader ? (
        <DispoButton icon="add" onPress={addSong} size="compact" variant="secondary">
          {t('Suggérer un morceau')}
        </DispoButton>
      ) : null}
      <SectionHeader
        action={{ icon: 'add', label: t('Ajouter'), onPress: () => void pickDocument() }}
        subtitle={t('PDF, grilles et partitions libres')}
        title={t('Documents')}
      />
      {looseDocuments.map((document) => (
        <DocumentRow
          canDelete={isLeader || document.addedById === userId}
          document={document}
          key={document.id}
        />
      ))}
      {documentError ? (
        <AppText color={palette.error} style={styles.center} variant="caption">
          {documentError}
        </AppText>
      ) : null}
      {!looseDocuments.length ? (
        <AppText color={palette.muted} style={styles.center} variant="caption">
          {t('Aucun document libre pour l’instant.')}
        </AppText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  decision: { gap: spacing.xs, paddingTop: spacing.xs },
  stack: { gap: spacing.xs },
});
