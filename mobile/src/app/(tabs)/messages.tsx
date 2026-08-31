import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GroupRow, InvitationCard } from '@/features/groups/group-list-screen';
import {
  useGroupInvitations,
  useGroups,
  useGroupUnreadState,
} from '@/features/groups/group-queries';
import { ConversationCard } from '@/features/messages/conversation-card';
import { useConversations } from '@/features/messages/message-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

type MessageSegment = 'conversations' | 'groups';

function SegmentControl({
  onChange,
  value,
}: {
  onChange: (value: MessageSegment) => void;
  value: MessageSegment;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const options: { label: string; value: MessageSegment }[] = [
    { label: t('Conversations'), value: 'conversations' },
    { label: t('Groupes'), value: 'groups' },
  ];
  return (
    <View
      accessibilityLabel={t('Espace')}
      accessibilityRole="tablist"
      style={[styles.segment, { backgroundColor: palette.inset }]}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segmentOption,
              selected && {
                backgroundColor: palette.card,
                borderColor: palette.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <AppText style={styles.segmentLabel}>{option.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MessagesScreen() {
  const params = useLocalSearchParams<{ segment?: string | string[] }>();
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const requestedSegment = Array.isArray(params.segment) ? params.segment[0] : params.segment;
  const [selectedSegment, setSelectedSegment] = useState<MessageSegment>('conversations');
  const segment = requestedSegment === 'groups' ? 'groups' : selectedSegment;
  const conversationsQuery = useConversations(session?.user.id ?? '');
  const groupsQuery = useGroups();
  const invitationsQuery = useGroupInvitations();
  const groupUnread = useGroupUnreadState(groupsQuery.data ?? []);
  const conversations = conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const changeSegment = (value: MessageSegment) => {
    setSelectedSegment(value);
    if (requestedSegment) router.setParams({ segment: undefined });
  };

  const header = (
    <View style={styles.header}>
      <ScreenHeader
        action={
          segment === 'groups' ? (
            <Pressable
              accessibilityLabel={t('Nouveau groupe')}
              accessibilityRole="button"
              onPress={() => router.push('/groups/new' as never)}
              style={({ pressed }) => [
                styles.newGroup,
                { backgroundColor: `${palette.bronze}24` },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={palette.bronze} name="add-circle" size={15} />
              <AppText color={palette.bronze} style={styles.newGroupLabel} variant="caption">
                {t('Nouveau')}
              </AppText>
            </Pressable>
          ) : null
        }
        icon="chatbubbles"
        iconColor={palette.bronze}
        subtitle={t('Cale tes prochains dépannages')}
        title={t('Messages')}
      />
      <SegmentControl onChange={changeSegment} value={segment} />
    </View>
  );

  if (segment === 'conversations') {
    return (
      <Screen>
        <FlashList
          contentContainerStyle={styles.directContent}
          data={conversations}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            conversationsQuery.isLoading ? (
              <LoadingState label={t('Chargement des conversations…')} />
            ) : conversationsQuery.isError ? (
              <ErrorState
                message={conversationsQuery.error.message}
                onRetry={() => void conversationsQuery.refetch()}
              />
            ) : (
              <EmptyState
                icon="chatbubble-ellipses-outline"
                message={t(
                  "Contacte un musicien dispo depuis l'accueil pour organiser un dépannage.",
                )}
                title={t('Aucune conversation')}
              />
            )
          }
          ListHeaderComponent={header}
          onEndReached={() => {
            if (conversationsQuery.hasNextPage && !conversationsQuery.isFetchingNextPage) {
              void conversationsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.55}
          refreshControl={
            <RefreshControl
              colors={[palette.electric]}
              onRefresh={() => void conversationsQuery.refetch()}
              refreshing={conversationsQuery.isRefetching && !conversationsQuery.isFetchingNextPage}
              tintColor={palette.electric}
            />
          }
          renderItem={({ item }) => (
            <ConversationCard
              conversation={item}
              onPress={() =>
                router.push(`/messages/${item.id}?name=${encodeURIComponent(item.contactName)}`)
              }
            />
          )}
        />
      </Screen>
    );
  }

  const refreshGroups = () => {
    void groupsQuery.refetch();
    void invitationsQuery.refetch();
  };
  const groupLoading = groupsQuery.isLoading || invitationsQuery.isLoading;
  const groupError = groupsQuery.error ?? invitationsQuery.error;
  const hasGroups = (groupsQuery.data?.length ?? 0) > 0;
  const hasInvitations = (invitationsQuery.data?.length ?? 0) > 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.groupContent}
        refreshControl={
          <RefreshControl
            colors={[palette.electric]}
            onRefresh={refreshGroups}
            refreshing={groupsQuery.isRefetching || invitationsQuery.isRefetching}
            tintColor={palette.electric}
          />
        }
      >
        {header}
        {groupLoading ? <LoadingState label={t('Chargement des groupes…')} /> : null}
        {groupError ? (
          <ErrorState
            message={t('Tes groupes n’ont pas pu être chargés.')}
            onRetry={refreshGroups}
          />
        ) : null}
        {!groupLoading && !groupError ? (
          <>
            {invitationsQuery.data?.map((invitation) => (
              <InvitationCard invitation={invitation} key={invitation.id} />
            ))}
            {groupsQuery.data?.map((group) => (
              <GroupRow
                group={group}
                key={group.id}
                unread={groupUnread.countFor(group.id)}
                userId={session?.user.id ?? ''}
              />
            ))}
            {!hasGroups && !hasInvitations ? (
              <EmptyState
                icon="people-circle-outline"
                message={t(
                  'Ajoute ton école ou crée ton premier groupe : messages, membres et prochaines dates seront réunis ici.',
                )}
                title={t('Ton collectif commence ici')}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  directContent: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  groupContent: {
    gap: spacing.cluster,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
  },
  header: { gap: spacing.sm, marginHorizontal: -spacing.gutter },
  newGroup: {
    alignItems: 'center',
    borderRadius: radii.round,
    flexDirection: 'row',
    gap: spacing.tight,
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  newGroupLabel: { fontWeight: '800' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
  segment: {
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: 2,
    marginHorizontal: spacing.gutter,
    padding: 2,
  },
  segmentLabel: { fontSize: 13, fontWeight: '800' },
  segmentOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.xs,
  },
  separator: { height: spacing.sm },
});
