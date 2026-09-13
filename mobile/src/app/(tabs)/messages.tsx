import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { SegmentedControl } from '@/components/ui/segmented-control';
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
import { spacing } from '@/theme/tokens';

type MessageSegment = 'conversations' | 'groups';

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
      <ScreenHeader icon="chatbubbles" inset={false} title={t('Messages')} />
      <SegmentedControl
        onChange={changeSegment}
        options={[
          { label: t('Conversations'), value: 'conversations' },
          { label: t('Groupes'), value: 'groups' },
        ]}
        value={segment}
      />
    </View>
  );

  if (segment === 'conversations') {
    return (
      <Screen nativeTabRoot>
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
    <Screen nativeTabRoot>
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
        <View style={styles.sectionHeading}>
          <View style={styles.flex}>
            <SectionHeader title={t('Groupes')} />
          </View>
          <DispoButton
            accessibilityLabel={t('Nouveau groupe')}
            icon="add-circle"
            onPress={() => router.push('/groups/new' as never)}
            size="compact"
            variant="secondary"
          >
            {t('Nouveau')}
          </DispoButton>
        </View>
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
                  'Crée ton premier groupe : messages, membres, répertoire et dates seront réunis ici.',
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
  flex: { flex: 1, minWidth: 0 },
  groupContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
  },
  header: { gap: spacing.sm, paddingBottom: spacing.sm },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  separator: { height: spacing.sm },
});
