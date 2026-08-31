import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { GroupEventsTab } from './group-events-tab';
import { GroupMessagesTab } from './group-messages-tab';
import type { GroupTab } from './group-model';
import { useGroup, useMarkGroupSeen } from './group-queries';
import { GroupRepertoireTab } from './group-repertoire-tab';

import { ChoiceChip } from '@/components/ui/choice-chip';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction } from '@/components/ui/section';
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
  const backAction = (
    <HeaderAction icon="chevron-back" label={t('Retour')} onPress={() => router.back()} />
  );
  useEffect(() => {
    markSeen(groupId);
    return () => markSeen(groupId);
  }, [groupId, markSeen]);
  if (query.isLoading)
    return (
      <Screen>
        <ScreenHeader leadingAction={backAction} eyebrow={t('Groupes')} title={t('Groupe')} />
        <LoadingState label={t('Chargement du groupe…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen>
        <ScreenHeader leadingAction={backAction} eyebrow={t('Groupes')} title={t('Groupe')} />
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
        <ScreenHeader leadingAction={backAction} eyebrow={t('Groupes')} title={t('Groupe')} />
        <ErrorState message={t('Ce groupe n’est plus accessible.')} />
      </Screen>
    );
  const userId = session?.user.id ?? '';
  const isLeader = group.leaderId === userId;
  const openGroupMenu = () =>
    Alert.alert(group.name, undefined, [
      {
        onPress: () => router.push(`/groups/${group.id}/members` as never),
        text: t('Membres'),
      },
      ...(isLeader
        ? [
            {
              onPress: () => router.push(`/groups/${group.id}/settings` as never),
              text: t('Réglages du groupe'),
            },
          ]
        : []),
      { style: 'cancel' as const, text: t('Annuler') },
    ]);
  return (
    <Screen>
      <ScreenHeader
        action={
          <HeaderAction
            icon="ellipsis-horizontal"
            label={isLeader ? `${t('Membres')} / ${t('Réglages du groupe')}` : t('Membres')}
            onPress={openGroupMenu}
          />
        }
        leadingAction={backAction}
        subtitle={formatSwiftPlaceholders(
          t('%lld membres · %@'),
          group.members.length,
          formatSwiftPlaceholders(
            t('%lld morceaux'),
            group.repertoire.filter((song) => song.isApproved).length,
          ),
        )}
        title={group.name}
      />
      {isLeader || group.isPublic ? (
        <View style={styles.statusRow}>
          {isLeader ? <Tag color={palette.bronze} label={t('👑 Leader')} /> : null}
          {group.isPublic ? <Tag color={palette.jam} label={t('Public')} /> : null}
        </View>
      ) : null}
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
  tab: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.xs,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.gutter,
  },
});
