import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useCopyGroupSong, useGroups } from './group-queries';
import {
  copiedGroupSong,
  groupSongCopyDestinations,
  type GroupSongCopyDestination,
  type GroupSongCopyResult,
} from './group-song-copy';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function DestinationRow({
  destination,
  disabled,
  onToggle,
  selected,
}: {
  destination: GroupSongCopyDestination;
  disabled: boolean;
  onToggle: () => void;
  selected: boolean;
}) {
  const { i18n, t } = useTranslation();
  const { palette } = useDispoTheme();
  const date = destination.date
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage || 'fr-CH', { dateStyle: 'full' }).format(
        new Date(destination.date),
      )
    : t('Sans date');
  const duplicate = destination.isAlreadyPresent;
  return (
    <Pressable
      accessibilityLabel={`${destination.name}, ${t(destination.type)}, ${destination.groupName}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: duplicate || selected, disabled: duplicate || disabled }}
      disabled={duplicate || disabled}
      onPress={onToggle}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card
        padding={12}
        style={[
          styles.destinationCard,
          selected && { borderColor: palette.electric },
          duplicate && styles.duplicate,
        ]}
      >
        <View style={[styles.destinationIcon, { backgroundColor: palette.inset }]}>
          <Ionicons
            color={palette.bronze}
            name={destination.collection === 'event' ? 'calendar' : 'musical-notes'}
            size={19}
          />
        </View>
        <View style={styles.copy}>
          <AppText numberOfLines={1} style={styles.destinationTitle}>
            {destination.name}
          </AppText>
          {destination.collection === 'event' ? (
            <AppText color={palette.muted} variant="caption">
              {date}
            </AppText>
          ) : null}
          <View style={styles.tags}>
            <Tag color={palette.bronze} label={t(destination.type)} />
            {destination.collection === 'event' ? (
              <Tag color={palette.electric} label={destination.groupName} />
            ) : null}
          </View>
          <AppText
            color={duplicate ? palette.muted : palette.bronze}
            style={styles.hint}
            variant="caption2"
          >
            {duplicate
              ? t('Déjà dans cette destination')
              : destination.isDirect
                ? t('Ajouté directement')
                : t('Envoyé comme suggestion')}
          </AppText>
        </View>
        <Ionicons
          color={duplicate ? palette.muted : selected ? palette.electric : palette.bronze}
          name={duplicate || selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
        />
      </Card>
    </Pressable>
  );
}

function resultMessage(
  results: readonly GroupSongCopyResult[],
  destinations: readonly GroupSongCopyDestination[],
  translate: (key: string) => string,
): string {
  const names = new Map(destinations.map((destination) => [destination.id, destination.name]));
  const copied = results.filter((result) => result.status === 'copied');
  const duplicates = results.filter((result) => result.status === 'already-exists');
  const denied = results.filter((result) => result.status === 'permission-denied');
  const unavailable = results.filter((result) => result.status === 'unavailable');
  const failed = results.filter((result) => result.status === 'failed');
  const lines: string[] = [];
  if (copied.length)
    lines.push(
      `${translate('Morceau copié')} : ${copied.map((item) => names.get(item.destinationId)).join(', ')}.`,
    );
  if (duplicates.length)
    lines.push(
      `${translate('Déjà dans cette destination')} : ${duplicates
        .map((item) => names.get(item.destinationId))
        .join(', ')}.`,
    );
  if (denied.length)
    lines.push(
      `${translate('Tu n’as plus la permission de modifier cette destination.')} ${denied
        .map((item) => names.get(item.destinationId))
        .join(', ')}.`,
    );
  if (unavailable.length)
    lines.push(
      `${translate('Cette destination n’est plus disponible.')} ${unavailable
        .map((item) => names.get(item.destinationId))
        .join(', ')}.`,
    );
  if (failed.length)
    lines.push(
      `${translate('Vérifie le réseau puis réessaie.')} ${failed
        .map((item) => names.get(item.destinationId))
        .join(', ')}.`,
    );
  return lines.join('\n');
}

export function GroupSongCopyScreen({
  songId,
  sourceEventId,
  sourceGroupId,
}: {
  songId: string;
  sourceEventId: string | null;
  sourceGroupId: string;
}) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = useGroups();
  const copySong = useCopyGroupSong();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => query.data ?? [], [query.data]);
  const sourceGroup = groups.find((group) => group.id === sourceGroupId);
  const sourceEvent = sourceEventId
    ? sourceGroup?.events.find((event) => event.id === sourceEventId)
    : null;
  const song = sourceEventId
    ? sourceEvent?.setlist.find((item) => item.id === songId)
    : sourceGroup?.repertoire.find((item) => item.id === songId);
  const userId = session?.user.id ?? '';
  const destinations = useMemo(
    () =>
      song ? groupSongCopyDestinations(groups, song, { sourceEventId, sourceGroupId, userId }) : [],
    [groups, song, sourceEventId, sourceGroupId, userId],
  );
  const selectedDestinations = destinations.filter((destination) =>
    selectedIds.has(destination.id),
  );

  if (query.isLoading)
    return (
      <Screen>
        <LoadingState label={t('Chargement des destinations…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen>
        <ErrorState
          message={t('Les destinations n’ont pas pu être chargées.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  if (!sourceGroup || !song)
    return (
      <Screen>
        <ErrorState message={t('Ce morceau n’est plus accessible.')} />
      </Screen>
    );

  const toggle = (destinationId: string) => {
    void Haptics.selectionAsync();
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(destinationId)) next.delete(destinationId);
      else next.add(destinationId);
      return next;
    });
  };
  const submit = () => {
    const targets = selectedDestinations.map((destination) => ({
      copy: copiedGroupSong(song, {
        approved: destination.isDirect,
        suggestedBy: userId,
      }),
      destinationId: destination.id,
      eventId: destination.eventId,
      groupId: destination.groupId,
    }));
    copySong.mutate(targets, {
      onSuccess: (results) => {
        const copiedIds = new Set(
          results
            .filter((result) => result.status === 'copied')
            .map((result) => result.destinationId),
        );
        const retryableIds = new Set(
          results
            .filter((result) => result.status === 'failed')
            .map((result) => result.destinationId),
        );
        setSelectedIds(retryableIds);
        const message = resultMessage(results, selectedDestinations, (key) => t(key));
        if (copiedIds.size === results.length) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(t('Morceau copié'), message, [
            { onPress: () => router.back(), text: t('OK') },
          ]);
          return;
        }
        void Haptics.notificationAsync(
          copiedIds.size
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Error,
        );
        Alert.alert(copiedIds.size ? t('Copie partielle') : t('Copie impossible'), message);
      },
    });
  };

  return (
    <Screen>
      <ScreenHeader
        action={
          <Pressable
            accessibilityLabel={t('Fermer')}
            disabled={copySong.isPending}
            onPress={() => router.back()}
            style={[
              styles.closeButton,
              { backgroundColor: palette.card, borderColor: palette.border },
            ]}
          >
            <Ionicons color={palette.text} name="close" size={20} />
          </Pressable>
        }
        icon="copy-outline"
        iconColor={palette.bronze}
        subtitle={sourceGroup.name}
        title={t('Copier le morceau')}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.sourceCard}>
          <View style={[styles.songIcon, { backgroundColor: `${palette.bronze}1f` }]}>
            <Ionicons color={palette.bronze} name="musical-note" size={20} />
          </View>
          <View style={styles.copy}>
            <AppText numberOfLines={1} style={styles.songTitle}>
              {song.title}
            </AppText>
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {song.artist}
            </AppText>
          </View>
        </Card>
        <AppText color={palette.muted} variant="caption">
          {t('Choisis où copier ce morceau.')}
        </AppText>
        {!destinations.length ? (
          <EmptyState
            icon="albums-outline"
            message={t('Crée un événement ou rejoins un autre groupe pour y copier ce morceau.')}
            title={t('Aucune autre destination')}
          />
        ) : (
          <View style={styles.destinationStack}>
            {destinations.map((destination) => (
              <DestinationRow
                destination={destination}
                disabled={copySong.isPending}
                key={destination.id}
                onToggle={() => toggle(destination.id)}
                selected={selectedIds.has(destination.id)}
              />
            ))}
          </View>
        )}
        {selectedDestinations.length ? (
          <View style={styles.footer}>
            <AppText color={palette.muted} style={styles.selection} variant="caption">
              {selectedDestinations.length} {t('destination(s) sélectionnée(s)')}
            </AppText>
            <DispoButton
              disabled={!userId}
              icon="copy-outline"
              loading={copySong.isPending}
              onPress={submit}
            >
              {t('Copier le morceau')}
            </DispoButton>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  copy: { flex: 1, gap: 2 },
  destinationCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.control,
  },
  destinationIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  destinationStack: { gap: spacing.xs },
  destinationTitle: { fontWeight: '800' },
  duplicate: { opacity: 0.64 },
  footer: { gap: spacing.xs, paddingTop: spacing.xs },
  hint: { fontWeight: '700', marginTop: 2 },
  pressed: { opacity: 0.76 },
  selection: { textAlign: 'center' },
  songIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  songTitle: { fontWeight: '800' },
  sourceCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.control,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs, marginTop: spacing.xxs },
});
