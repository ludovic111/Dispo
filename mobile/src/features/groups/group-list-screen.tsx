import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { GroupAvatar } from './group-avatar';
import { latestGroupMessage, type MusicGroup, type PendingGroupInvitation } from './group-model';
import {
  useGroupInvitations,
  useGroups,
  useGroupUnreadState,
  useInvitationResponse,
} from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { CountBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { isModeratedMessage, moderatedPreview } from '@/features/messages/moderated-message';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { formatRelativeTime } from '@/i18n/relative-time';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function relativeDate(value: string, locale: string): string {
  const date = new Date(value);
  const delta = date.getTime() - Date.now();
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 60) return formatRelativeTime(minutes, 'minute', locale);
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatRelativeTime(hours, 'hour', locale);
  return formatRelativeTime(hours / 24, 'day', locale);
}

export function InvitationCard({ invitation }: { invitation: PendingGroupInvitation }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const response = useInvitationResponse();
  return (
    <Card padding={spacing.sm} tone="elevated">
      <View style={styles.invitationTop}>
        <GroupAvatar
          emoji={invitation.groupEmoji}
          name={invitation.groupName}
          photoUrl={invitation.groupPhotoUrl}
        />
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            <AppText numberOfLines={2} style={styles.groupTitle} variant="headline">
              {invitation.groupName}
            </AppText>
            <Tag color={palette.electric} label={t('Invitation')} />
          </View>
          <AppText color={palette.muted} variant="caption">
            {formatSwiftPlaceholders(
              t("%@ t'invite à rejoindre ce groupe"),
              invitation.invitedByName,
            )}
          </AppText>
          {invitation.kind === 'guest' ? (
            <AppText color={palette.bronze} variant="caption2" weight="semibold">
              🌠 {t('Special guest')} · {t('membre temporaire')}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.invitationActions}>
        <View style={styles.actionGrow}>
          <DispoButton
            disabled={response.isPending}
            icon="checkmark"
            onPress={() => response.mutate({ accept: true, invitationId: invitation.id })}
            size="compact"
          >
            {t('Accepter')}
          </DispoButton>
        </View>
        <View style={styles.actionGrow}>
          <DispoButton
            disabled={response.isPending}
            onPress={() => response.mutate({ accept: false, invitationId: invitation.id })}
            size="compact"
            variant="secondary"
          >
            {t('Refuser')}
          </DispoButton>
        </View>
      </View>
    </Card>
  );
}

export function GroupRow({
  group,
  unread,
  userId,
}: {
  group: MusicGroup;
  unread: number;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const last = latestGroupMessage(group.messages);
  const preview = last
    ? last.deletedAt
      ? t('Message supprimé')
      : `${last.senderId === userId ? t('Toi') : last.senderName} : ${
          isModeratedMessage(last)
            ? moderatedPreview(t)
            : last.text || last.attachmentName || t('Fichier')
        }`
    : t('Écris le premier message du groupe');
  return (
    <ListRow
      accessibilityLabel={`${t('Ouvrir')} ${group.name}`}
      accessory={
        <View style={styles.trailing}>
          {last ? (
            <AppText color={palette.muted} variant="caption2">
              {relativeDate(last.createdAt, i18n.resolvedLanguage ?? i18n.language ?? 'fr')}
            </AppText>
          ) : null}
          {unread > 0 ? (
            <CountBadge count={unread} />
          ) : (
            <Ionicons color={palette.muted} name="chevron-forward" size={16} />
          )}
        </View>
      }
      leading={<GroupAvatar emoji={group.emoji} name={group.name} photoUrl={group.photoUrl} />}
      onPress={() => router.push(`/groups/${group.id}` as never)}
      subtitle={preview}
      title={group.name}
    />
  );
}

export function GroupListScreen() {
  const { session } = useAuth();
  const groups = useGroups();
  const { t } = useTranslation();
  const invitations = useGroupInvitations();
  const unread = useGroupUnreadState(groups.data ?? []);
  const refreshing = groups.isRefetching || invitations.isRefetching;
  const nativeHeader = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <NativeHeaderButton
            icon="add"
            label={t('Nouveau groupe')}
            onPress={() => router.push('/groups/new' as never)}
          />
        ),
        title: t('Groupes'),
      }}
    />
  );
  const retry = () => {
    void groups.refetch();
    void invitations.refetch();
  };
  if (groups.isLoading || invitations.isLoading)
    return (
      <Screen nativeHeader>
        {nativeHeader}
        <LoadingState label={t('Chargement des groupes…')} />
      </Screen>
    );
  if (groups.error || invitations.error)
    return (
      <Screen nativeHeader>
        {nativeHeader}
        <ErrorState message={t('Tes groupes n’ont pas pu être chargés.')} onRetry={retry} />
      </Screen>
    );
  return (
    <Screen nativeHeader>
      {nativeHeader}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={retry} refreshing={refreshing} />}
      >
        {invitations.data?.map((invitation) => (
          <InvitationCard invitation={invitation} key={invitation.id} />
        ))}
        {groups.data?.length ? (
          groups.data.map((group) => (
            <GroupRow
              group={group}
              key={group.id}
              unread={unread.countFor(group.id)}
              userId={session?.user.id ?? ''}
            />
          ))
        ) : invitations.data?.length ? null : (
          <EmptyState
            action={{
              label: t('Nouveau groupe'),
              onPress: () => router.push('/groups/new' as never),
            }}
            icon="people-circle-outline"
            message={t(
              'Crée ton premier groupe : messages, membres, répertoire et dates seront réunis ici.',
            )}
            title={t('Ton collectif commence ici')}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionGrow: { flex: 1 },
  content: { gap: spacing.sm, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  copy: { flex: 1, gap: spacing.xxs },
  groupTitle: { flexShrink: 1 },
  invitationActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  invitationTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.tight },
  trailing: { alignItems: 'flex-end', gap: spacing.xs, justifyContent: 'center' },
});
