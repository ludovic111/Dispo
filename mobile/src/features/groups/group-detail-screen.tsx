import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { GroupAvatar } from './group-avatar';
import { GroupEventsTab } from './group-events-tab';
import { GroupMessagesTab } from './group-messages-tab';
import type { GroupTab } from './group-model';
import { useGroup, useMarkGroupSeen } from './group-queries';
import { GroupRepertoireTab } from './group-repertoire-tab';

import { AppText } from '@/components/ui/app-text';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const tabs: { icon: 'calendar' | 'chatbubbles' | 'musical-notes'; id: GroupTab; label: string }[] =
  [
    { icon: 'chatbubbles', id: 'messages', label: 'Messages' },
    { icon: 'musical-notes', id: 'repertoire', label: 'Répertoire' },
    { icon: 'calendar', id: 'events', label: 'Événements' },
  ];

export function GroupDetailScreen({ groupId }: { groupId: string }) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = useGroup(groupId);
  const markSeen = useMarkGroupSeen();
  const [tab, setTab] = useState<GroupTab>('messages');
  useEffect(() => {
    markSeen(groupId);
    return () => markSeen(groupId);
  }, [groupId, markSeen]);
  if (query.isLoading)
    return (
      <Screen>
        <LoadingState label={t('Chargement du groupe…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen>
        <ErrorState
          message={t('Ce groupe n’a pas pu être chargé.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  const group = query.data;
  if (!group)
    return (
      <Screen>
        <ErrorState message={t('Ce groupe n’est plus accessible.')} />
      </Screen>
    );
  const userId = session?.user.id ?? '';
  const isLeader = group.leaderId === userId;
  return (
    <Screen>
      <View style={styles.header}>
        <GroupAvatar emoji={group.emoji} name={group.name} photoUrl={group.photoUrl} size={44} />
        <View style={styles.headerCopy}>
          <View style={styles.titleLine}>
            <AppText numberOfLines={1} style={styles.title} variant="title2">
              {group.name}
            </AppText>
            {isLeader ? <Ionicons color={palette.bronze} name="trophy" size={15} /> : null}
            {group.isPublic ? <Tag color={palette.jam} label={t('Public')} /> : null}
          </View>
          <AppText color={palette.muted} variant="caption">
            {formatSwiftPlaceholders(
              t('%lld membres · %@'),
              group.members.length,
              formatSwiftPlaceholders(
                t('%lld morceaux'),
                group.repertoire.filter((song) => song.isApproved).length,
              ),
            )}
          </AppText>
        </View>
        <Pressable
          accessibilityLabel={t('Membres')}
          onPress={() => router.push(`/groups/${group.id}/members` as never)}
          style={[
            styles.headerButton,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <Ionicons color={palette.text} name="people" size={19} />
        </Pressable>
        {isLeader ? (
          <Pressable
            accessibilityLabel={t('Réglages du groupe')}
            onPress={() => router.push(`/groups/${group.id}/settings` as never)}
            style={[
              styles.headerButton,
              { backgroundColor: palette.card, borderColor: palette.border },
            ]}
          >
            <Ionicons color={palette.text} name="settings-outline" size={19} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.tabs}>
        {tabs.map((item) => (
          <View key={item.id} style={styles.tab}>
            <ChoiceChip
              icon={item.icon}
              label={t(item.label)}
              onPress={() => setTab(item.id)}
              selected={tab === item.id}
            />
          </View>
        ))}
      </View>
      <View style={styles.body}>
        {tab === 'messages' ? <GroupMessagesTab group={group} userId={userId} /> : null}
        {tab === 'repertoire' ? <GroupRepertoireTab group={group} userId={userId} /> : null}
        {tab === 'events' ? <GroupEventsTab group={group} userId={userId} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.control,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerCopy: { flex: 1, gap: 2 },
  tab: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.xs,
  },
  title: { flexShrink: 1 },
  titleLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
});
