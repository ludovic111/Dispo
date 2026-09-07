import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { useDiscoveryState } from '@/features/discovery/discovery-context';
import {
  HomeAvailabilitySection,
  HomeEmptyState,
  HomeGroupsSection,
} from '@/features/discovery/discovery-home-sections';
import { DiscoveryHomeWelcome } from '@/features/discovery/discovery-home-welcome';
import {
  activeFilterCount,
  dateForAvailabilityScope,
  matchesDiscoveryFilters,
  openingScope,
  profileAvailability,
  profilesForScope,
  rankProfiles,
} from '@/features/discovery/discovery-model';
import { DiscoveryProfileRow } from '@/features/discovery/discovery-profile-row';
import { upcomingGroupEvents } from '@/features/groups/group-model';
import { useGroups } from '@/features/groups/group-queries';
import { useNotificationUnreadCount } from '@/features/notifications/notification-queries';
import { useDiscoveryProfiles, useProfile } from '@/features/profiles/profile-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function DiscoveryScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const { filters, scope, setScope } = useDiscoveryState();
  const profilesQuery = useDiscoveryProfiles(userId);
  const meQuery = useProfile(userId, userId);
  const groupsQuery = useGroups();
  const notificationsQuery = useNotificationUnreadCount();
  const pickedOpeningScope = useRef(false);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = profilesQuery;

  const profiles = useMemo(
    () => profilesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [profilesQuery.data?.pages],
  );
  const filtered = useMemo(() => {
    const referenceProfile = meQuery.data ?? null;
    const rankingDate = new Date();
    return profiles
      .filter((profile) => matchesDiscoveryFilters(profile, filters, referenceProfile))
      .sort((left, right) => rankProfiles(left, right, referenceProfile, rankingDate));
  }, [filters, meQuery.data, profiles]);
  const visible = useMemo(() => profilesForScope(filtered, scope), [filtered, scope]);
  const scopeCounts = useMemo(
    () => ({
      nearby: profilesForScope(filtered, 'nearby').length,
      today: profilesForScope(filtered, 'today').length,
      weekend: profilesForScope(filtered, 'weekend').length,
    }),
    [filtered],
  );

  useEffect(() => {
    if (!pickedOpeningScope.current && filtered.length > 0) {
      pickedOpeningScope.current = true;
      setScope(openingScope(filtered));
    }
  }, [filtered, setScope]);

  const unread = notificationsQuery.data ?? 0;
  const now = new Date();
  const myAvailability = meQuery.data ? profileAvailability(meQuery.data, now) : null;
  const myAvailabilityColor =
    myAvailability?.kind === 'today'
      ? palette.jam
      : myAvailability?.kind === 'thisWeek'
        ? palette.electric
        : myAvailability?.kind === 'weekend'
          ? palette.rehearsal
          : palette.bronze;
  const selectedScopeDate = dateForAvailabilityScope(scope, filters.neededDate, now);
  const greeting = t(now.getHours() >= 17 || now.getHours() < 5 ? 'Bonsoir' : 'Salut');
  const firstName = meQuery.data?.name.split(/\s+/)[0] || t('musicien');
  const groups = useMemo(
    () =>
      (groupsQuery.data ?? []).map((group) => ({
        date: upcomingGroupEvents(group.events)[0]?.date ?? null,
        emoji: group.emoji,
        photoUrl: group.photoUrl,
        id: group.id,
        name: group.name,
        memberCount: group.members.length,
      })),
    [groupsQuery.data],
  );

  const refresh = () =>
    Promise.all([
      profilesQuery.refetch(),
      meQuery.refetch(),
      groupsQuery.refetch(),
      notificationsQuery.refetch(),
    ]);

  if (profilesQuery.isLoading || meQuery.isLoading) {
    return (
      <Screen nativeTabRoot>
        <LoadingState label={t('On cherche les musiciens…')} />
      </Screen>
    );
  }
  if (profilesQuery.isExhaustiveError) {
    return (
      <Screen nativeTabRoot>
        <ErrorState
          message={profilesQuery.error?.message ?? t('Chargement impossible.')}
          onRetry={() => void refresh()}
        />
      </Screen>
    );
  }

  const header = (
    <View style={styles.headerContent}>
      <DiscoveryHomeWelcome
        availabilityColor={
          myAvailability && myAvailability.kind !== 'unavailable' ? myAvailabilityColor : null
        }
        firstName={firstName}
        greeting={greeting}
        networkCount={profiles.length}
        onNotifications={() => router.push('/notification-center' as never)}
        onProfile={() => router.navigate('/(tabs)/profile')}
        onSearch={() => router.push('/search' as never)}
        profileName={meQuery.data?.name ?? firstName}
        profilePhotoUrl={meQuery.data?.photoUrl ?? null}
        unread={unread}
      />

      <HomeGroupsSection
        groups={groups}
        isError={groupsQuery.isError}
        isLoading={groupsQuery.isLoading}
        onCreate={() => router.push('/groups/new' as never)}
        onOpen={(id) => router.push(`/groups/${id}` as never)}
        onRetry={() => void groupsQuery.refetch()}
      />
      <HomeAvailabilitySection
        counts={scopeCounts}
        filterCount={activeFilterCount(filters)}
        onFilters={() => router.push('/filters' as never)}
        onScopeChange={setScope}
        scope={scope}
      />
    </View>
  );

  return (
    <Screen nativeTabRoot>
      <FlashList
        contentContainerStyle={styles.listContent}
        data={visible}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <HomeEmptyState
            onExplore={() =>
              scope === 'nearby' ? router.push('/filters' as never) : setScope('nearby')
            }
            scope={scope}
          />
        }
        ListHeaderComponent={header}
        ListFooterComponent={
          isFetchingNextPage ? <LoadingState label={t('Chargement de la suite…')} /> : null
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.45}
        refreshControl={
          <RefreshControl
            colors={[palette.electric]}
            onRefresh={() => void refresh()}
            refreshing={
              profilesQuery.isRefetching ||
              meQuery.isRefetching ||
              groupsQuery.isRefetching ||
              notificationsQuery.isRefetching
            }
            tintColor={palette.electric}
          />
        }
        renderItem={({ item }) => (
          <DiscoveryProfileRow
            primarySchool={item.schools[0] ?? null}
            profile={item}
            referenceProfile={meQuery.data ?? null}
            scopeDate={selectedScopeDate}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerContent: { gap: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.md },
  listContent: { paddingBottom: spacing.xl, paddingHorizontal: spacing.gutter },
  separator: { height: spacing.gutter },
});
