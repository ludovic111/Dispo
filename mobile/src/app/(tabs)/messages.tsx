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
import { SchoolCommunityRow } from '@/features/schools/school-community-row';
import { useSchoolCommunities, useSchoolUnreadState } from '@/features/schools/school-queries';
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
      style={[styles.segment, { backgroundColor: palette.cardMuted }]}
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
                backgroundColor: `${palette.electric}1F`,
                borderColor: `${palette.electric}66`,
              },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              color={selected ? palette.electric : palette.muted}
              style={styles.segmentLabel}
            >
              {option.label}
            </AppText>
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
  const schoolsQuery = useSchoolCommunities();
  const groupUnread = useGroupUnreadState(groupsQuery.data ?? []);
  const schoolUnread = useSchoolUnreadState(schoolsQuery.data ?? []);
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
                { backgroundColor: `${palette.electric}20` },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={palette.electric} name="add-circle" size={15} />
              <AppText color={palette.electric} style={styles.newGroupLabel} variant="caption">
                {t('Nouveau')}
              </AppText>
            </Pressable>
          ) : null
        }
        icon="chatbubbles"
        iconColor={palette.electric}
        subtitle={t('Cale tes prochains dépannages')}
        title={t('Messages')}
      />
      <SegmentControl onChange={changeSegment} value={segment} />
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
    void schoolsQuery.refetch();
  };
  const groupLoading =
    groupsQuery.isLoading || invitationsQuery.isLoading || schoolsQuery.isLoading;
  const groupError = groupsQuery.error ?? invitationsQuery.error ?? schoolsQuery.error;
  const hasGroups = (groupsQuery.data?.length ?? 0) > 0;
  const hasInvitations = (invitationsQuery.data?.length ?? 0) > 0;
  const hasSchools = (schoolsQuery.data?.length ?? 0) > 0;

  return (
    <Screen nativeTabRoot>
      <ScrollView
        contentContainerStyle={styles.groupContent}
        refreshControl={
          <RefreshControl
            colors={[palette.electric]}
            onRefresh={refreshGroups}
            refreshing={
              groupsQuery.isRefetching || invitationsQuery.isRefetching || schoolsQuery.isRefetching
            }
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
            {hasSchools ? (
              <View style={styles.sectionHeading}>
                <View style={styles.sectionHeadingTitle}>
                  <Ionicons color={palette.electric} name="school" size={17} />
                  <AppText style={styles.sectionHeadingText} variant="subheadline">
                    {t('Écoles')}
                  </AppText>
                </View>
              </View>
            ) : null}
            {schoolsQuery.data?.map((community) => (
              <SchoolCommunityRow
                community={community}
                key={community.affiliation.school.id}
                onPress={() =>
                  router.push(`/schools/${community.affiliation.school.id}/community` as never)
                }
                unread={schoolUnread.countFor(community.affiliation.school.id)}
              />
            ))}
            {(hasInvitations || hasGroups) && hasSchools ? (
              <View style={styles.sectionHeading}>
                <View style={styles.sectionHeadingTitle}>
                  <Ionicons color={palette.electric} name="people" size={17} />
                  <AppText style={styles.sectionHeadingText} variant="subheadline">
                    {t('Groupes')}
                  </AppText>
                </View>
              </View>
            ) : null}
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
            {!hasSchools && !hasGroups && !hasInvitations ? (
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
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingTop: spacing.xs,
  },
  sectionHeadingText: { fontWeight: '800' },
  sectionHeadingTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  separator: { height: spacing.sm },
});
