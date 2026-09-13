import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import type { GroupSong } from './group-model';
import { useCopyGroupSong, useGroups } from './group-queries';
import {
  copiedGroupSong,
  groupSongCopyDestinations,
  type GroupSongCopyDestination,
  type GroupSongCopyResult,
} from './group-song-copy';

import { AppText } from '@/components/ui/app-text';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { disabledStyle, spacing } from '@/theme/tokens';

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
  const duplicate = destination.isAlreadyPresent;
  const date = destination.date
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage || 'fr-CH', { dateStyle: 'full' }).format(
        new Date(destination.date),
      )
    : t('Sans date');
  const meta = [
    t(destination.type),
    destination.collection === 'event' ? destination.groupName : null,
    destination.collection === 'event' ? date : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  const status = duplicate
    ? t('Déjà dans cette destination')
    : destination.isDirect
      ? t('Ajouté directement')
      : t('Envoyé comme suggestion');
  const row = (
    <ListRow
      accessibilityLabel={`${destination.name}, ${t(destination.type)}, ${destination.groupName}`}
      accessory={
        <Ionicons
          color={duplicate ? palette.muted : selected ? palette.electric : palette.bronze}
          name={duplicate || selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
        />
      }
      leadingIcon={destination.collection === 'event' ? 'calendar' : 'musical-notes'}
      leadingIconColor={palette.bronze}
      subtitle={`${meta}\n${status}`}
      title={destination.name}
      {...(duplicate || disabled ? {} : { onPress: onToggle })}
    />
  );
  return duplicate ? <View style={disabledStyle}>{row}</View> : row;
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
  personalSong,
  songId,
  sourceEventId,
  sourceGroupId,
}: {
  personalSong?: GroupSong;
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
  const song =
    personalSong ??
    (sourceEventId
      ? sourceEvent?.setlist.find((item) => item.id === songId)
      : sourceGroup?.repertoire.find((item) => item.id === songId));
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
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des destinations…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Les destinations n’ont pas pu être chargées.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  if ((!sourceGroup && !personalSong) || !song)
    return (
      <Screen nativeHeader>
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
    <Screen nativeHeader>
      <ScrollView contentContainerStyle={styles.content}>
        <ListRow
          leadingIcon="musical-note"
          leadingIconColor={palette.bronze}
          title={song.title}
          {...(song.artist ? { subtitle: song.artist } : {})}
        />
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
              {t('{{count}} destination sélectionnée', { count: selectedDestinations.length })}
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
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  destinationStack: { gap: spacing.xs },
  footer: { gap: spacing.xs, paddingTop: spacing.xs },
  selection: { textAlign: 'center' },
});
