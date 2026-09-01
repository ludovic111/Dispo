import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { GroupAvatar } from './group-avatar';
import {
  latestGroupMessage,
  upcomingGroupEvents,
  type MusicGroup,
  type PendingGroupInvitation,
} from './group-model';
import {
  useGroupInvitations,
  useGroups,
  useGroupUnreadState,
  useInvitationResponse,
} from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { formatRelativeTime } from '@/i18n/relative-time';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing, typography } from '@/theme/tokens';

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
    <Card padding={13}>
      <View style={styles.invitationTop}>
        <GroupAvatar
          emoji={invitation.groupEmoji}
          name={invitation.groupName}
          photoUrl={invitation.groupPhotoUrl}
        />
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            <AppText numberOfLines={1} style={styles.groupTitle}>
              {invitation.groupName}
            </AppText>
            <Tag color={palette.electric} label={t('Invitation')} />
            {invitation.kind === 'guest' ? <AppText>🌠</AppText> : null}
          </View>
          <AppText color={palette.muted} variant="caption">
            {formatSwiftPlaceholders(
              t("%@ t'invite à rejoindre ce groupe"),
              invitation.invitedByName,
            )}
          </AppText>
          {invitation.kind === 'guest' ? (
            <AppText color={palette.bronze} style={styles.guest} variant="caption2">
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
          >
            {t('Accepter')}
          </DispoButton>
        </View>
        <View style={styles.actionGrow}>
          <DispoButton
            disabled={response.isPending}
            onPress={() => response.mutate({ accept: false, invitationId: invitation.id })}
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
  const songs = group.repertoire.filter((song) => song.isApproved).length;
  const dates = upcomingGroupEvents(group.events).length;
  return (
    <Pressable
      accessibilityLabel={`${t('Ouvrir')} ${group.name}`}
      accessibilityRole="button"
      onPress={() => router.push(`/groups/${group.id}` as never)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={13}>
        <View style={styles.row}>
          <GroupAvatar emoji={group.emoji} name={group.name} photoUrl={group.photoUrl} />
          <View style={styles.copy}>
            <View style={styles.titleLine}>
              <AppText numberOfLines={1} style={styles.groupTitle}>
                {group.name}
              </AppText>
              {group.isPublic ? <Tag color={palette.jam} label={t('Public')} /> : null}
              <View style={styles.spacer} />
              {last ? (
                <AppText color={palette.muted} variant="caption2">
                  {relativeDate(last.createdAt, i18n.resolvedLanguage ?? i18n.language ?? 'fr')}
                </AppText>
              ) : null}
            </View>
            <AppText
              color={palette.bronze}
              numberOfLines={1}
              style={styles.meta}
              variant="caption2"
            >
              {formatSwiftPlaceholders(
                t('%lld membres · %lld morceaux · %lld événements'),
                group.members.length,
                songs,
                dates,
              )}
            </AppText>
            {last ? (
              <AppText color={palette.muted} numberOfLines={1} variant="caption">
                {last.deletedAt
                  ? t('Message supprimé')
                  : `${last.senderId === userId ? t('Toi') : last.senderName} : ${last.text || last.attachmentName || t('Fichier')}`}
              </AppText>
            ) : (
              <AppText color={palette.muted} numberOfLines={1} variant="caption">
                {t('Écris le premier message du groupe')}
              </AppText>
            )}
          </View>
          <View style={styles.trailing}>
            {unread > 0 ? (
              <View style={[styles.unread, { backgroundColor: palette.electric }]}>
                <AppText color="#050814" style={styles.unreadText}>
                  {unread > 99 ? '99+' : unread}
                </AppText>
              </View>
            ) : null}
            <Ionicons color={palette.muted} name="chevron-forward" size={16} />
          </View>
        </View>
      </Card>
    </Pressable>
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
  content: { gap: spacing.cluster, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  copy: { flex: 1, gap: 3 },
  groupTitle: { flexShrink: 1, fontWeight: '800' },
  guest: { fontWeight: '700' },
  invitationActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.control },
  invitationTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  meta: { fontWeight: '700' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  spacer: { flex: 1 },
  titleLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  trailing: { alignItems: 'center', gap: spacing.xs },
  unread: {
    alignItems: 'center',
    borderRadius: 11,
    minHeight: 22,
    minWidth: 22,
    paddingHorizontal: 5,
  },
  unreadText: { fontFamily: typography.monoSemibold, fontSize: 10, lineHeight: 22 },
});
