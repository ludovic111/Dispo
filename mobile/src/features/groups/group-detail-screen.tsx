import { router, Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { GroupEventsTab } from './group-events-tab';
import { GroupMessagesTab } from './group-messages-tab';
import type { GroupTab } from './group-model';
import { useGroup, useMarkGroupSeen } from './group-queries';
import { GroupRepertoireTab } from './group-repertoire-tab';

import { AppText } from '@/components/ui/app-text';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { UnderlineTabs } from '@/components/ui/segmented-control';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const tabs: { id: GroupTab; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'repertoire', label: 'Répertoire' },
  { id: 'events', label: 'Événements' },
];

export function GroupDetailScreen({ groupId }: { groupId: string }) {
  const headerHeight = useHeaderHeight();
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
      <Screen nativeHeader>
        <LoadingState label={t('Chargement du groupe…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Ce groupe n’a pas pu être chargé.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  const group = query.data;
  if (!group)
    return (
      <Screen nativeHeader>
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
    <Screen nativeHeader>
      <Stack.Screen
        options={{
          headerRight: () => (
            <NativeHeaderButton
              icon="ellipsis-horizontal"
              label={isLeader ? `${t('Membres')} / ${t('Réglages du groupe')}` : t('Membres')}
              onPress={openGroupMenu}
            />
          ),
          title: group.name,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
        style={styles.body}
      >
        <AppText color={palette.muted} style={styles.groupSummary} variant="caption">
          {formatSwiftPlaceholders(
            t('%lld membres · %@'),
            group.members.length,
            formatSwiftPlaceholders(
              t('%lld morceaux'),
              group.repertoire.filter((song) => song.isApproved).length,
            ),
          )}
        </AppText>
        {isLeader || group.isPublic ? (
          <View style={styles.statusRow}>
            {isLeader ? <Tag color={palette.bronze} label={t('👑 Leader')} /> : null}
            {group.isPublic ? <Tag color={palette.jam} label={t('Public')} /> : null}
          </View>
        ) : null}
        <View style={styles.tabs}>
          <UnderlineTabs
            onChange={setTab}
            options={tabs.map((item) => ({ label: t(item.label), value: item.id }))}
            value={tab}
          />
        </View>
        <View style={styles.body}>
          {tab === 'messages' ? <GroupMessagesTab group={group} userId={userId} /> : null}
          {tab === 'repertoire' ? <GroupRepertoireTab group={group} userId={userId} /> : null}
          {tab === 'events' ? <GroupEventsTab group={group} userId={userId} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  groupSummary: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xs },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xxs,
  },
  tabs: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xs },
});
