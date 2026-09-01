import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { PillButton, SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { useDiscoveryState } from '@/features/discovery/discovery-context';
import {
  activeFilterCount,
  dateForAvailabilityScope,
  matchesDiscoveryFilters,
  openingScope,
  profileAvailability,
  profilesForScope,
  rankProfiles,
  type AvailabilityScope,
} from '@/features/discovery/discovery-model';
import { DiscoveryProfileRow } from '@/features/discovery/discovery-profile-row';
import { upcomingGroupEvents } from '@/features/groups/group-model';
import { useGroups } from '@/features/groups/group-queries';
import { useNotificationUnreadCount } from '@/features/notifications/notification-queries';
import { useDiscoveryProfiles, useProfile } from '@/features/profiles/profile-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, minimumTouchTarget, radii, spacing, typography } from '@/theme/tokens';

const scopeConfig: Record<
  AvailabilityScope,
  { icon: 'calendar' | 'location' | 'flash'; label: string }
> = {
  nearby: { icon: 'location', label: 'Près de chez toi' },
  today: { icon: 'flash', label: "Aujourd'hui" },
  weekend: { icon: 'calendar', label: 'Ce week-end' },
};

function ScopeButton({
  count,
  onPress,
  scope,
  selected,
}: {
  count: number;
  onPress: () => void;
  scope: AvailabilityScope;
  selected: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const config = scopeConfig[scope];
  const activeColor = palette.electric;
  const activeText = billetInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.scope,
        {
          backgroundColor: selected ? activeColor : palette.cardMuted,
          borderColor: selected ? 'transparent' : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={selected ? activeText : palette.text} name={config.icon} size={12} />
      <AppText
        color={selected ? activeText : palette.text}
        style={styles.scopeLabel}
        variant="subheadline"
      >
        {t(config.label)}
      </AppText>
      <View
        style={[
          styles.scopeCount,
          { backgroundColor: selected ? 'rgba(0,0,0,0.16)' : palette.inset },
        ]}
      >
        <AppText color={selected ? activeText : palette.text} style={styles.scopeCountText}>
          {count}
        </AppText>
      </View>
    </Pressable>
  );
}

function HomeQuickAction({
  color,
  icon,
  label,
  onPress,
}: {
  color: string;
  icon: 'calendar-outline' | 'people-outline' | 'school-outline';
  label: string;
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { backgroundColor: palette.cardMuted, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: `${color}1F` }]}>
        <Ionicons color={color} name={icon} size={16} />
      </View>
      <AppText numberOfLines={1} style={styles.quickActionLabel} variant="caption">
        {label}
      </AppText>
    </Pressable>
  );
}

export default function DiscoveryScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
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
        id: group.id,
        name: group.name,
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
      <View style={styles.topRow}>
        <View style={styles.greeting}>
          <BrandLogo markSize={20} />
          <AppText style={styles.greetingTitle} variant="display">
            {greeting}, {firstName}
          </AppText>
          <View style={styles.networkLine}>
            <Ionicons color={palette.electric} name="people" size={13} />
            <AppText color={palette.muted} variant="subheadline">
              {formatSwiftPlaceholders(t('%lld musiciens sur le réseau'), profiles.length)}
            </AppText>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel={t('Notifications')}
            accessibilityRole="button"
            accessibilityValue={{
              text: formatSwiftPlaceholders(t('%lld non lues'), unread),
            }}
            onPress={() => router.push('/notification-center' as never)}
            style={({ pressed }) => [
              styles.circleAction,
              { backgroundColor: palette.cardMuted, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={palette.electric}
              name={unread > 0 ? 'notifications' : 'notifications-outline'}
              size={19}
            />
            {unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: palette.signal }]}>
                <AppText color="#FFFFFF" style={styles.badgeText}>
                  {unread > 99 ? '99+' : unread}
                </AppText>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel={t('Ouvrir mon profil')}
            accessibilityRole="button"
            onPress={() => router.navigate('/(tabs)/profile')}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <View>
              <Avatar
                name={meQuery.data?.name ?? firstName}
                size={48}
                uri={meQuery.data?.photoUrl ?? null}
              />
              {myAvailability && myAvailability.kind !== 'unavailable' ? (
                <View
                  style={[
                    styles.availableDot,
                    { backgroundColor: myAvailabilityColor, borderColor: palette.background },
                  ]}
                />
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="search"
        onPress={() => router.push('/search' as never)}
        style={({ pressed }) => [
          styles.search,
          { backgroundColor: palette.cardMuted, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color={palette.muted} name="search" size={17} />
        <AppText color={palette.muted} numberOfLines={1} variant="subheadline">
          {t('Musicien, @pseudo, instrument, lieu…')}
        </AppText>
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.quickActions}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <HomeQuickAction
          color={
            myAvailability && myAvailability.kind !== 'unavailable'
              ? myAvailabilityColor
              : palette.electric
          }
          icon="calendar-outline"
          label={t('Mes disponibilités')}
          onPress={() => router.push('/profile/availability' as never)}
        />
        <HomeQuickAction
          color={palette.electric}
          icon="school-outline"
          label={t('Écoles')}
          onPress={() => router.push('/schools' as never)}
        />
        {groups.length === 0 ? (
          <HomeQuickAction
            color={palette.electric}
            icon="people-outline"
            label={t('Nouveau groupe')}
            onPress={() => router.push('/groups/new' as never)}
          />
        ) : null}
      </ScrollView>

      {groups.length > 0 ? (
        <View style={styles.groups}>
          <AppText style={styles.sectionLabel} variant="label">
            {t('Mes groupes')}
          </AppText>
          {groups.map((group) => (
            <Pressable
              accessibilityRole="button"
              key={group.id}
              onPress={() => router.push(`/groups/${group.id}` as never)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Card padding={spacing.sm} tone="inset">
                <View style={styles.groupRow}>
                  <View style={styles.groupCopy}>
                    <AppText numberOfLines={1} style={styles.groupName} variant="subheadline">
                      {group.emoji} {group.name}
                    </AppText>
                    <AppText color={palette.muted} variant="caption">
                      {group.date
                        ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
                            day: 'numeric',
                            month: 'short',
                            weekday: 'short',
                          }).format(new Date(group.date))
                        : t('Aucune session')}
                    </AppText>
                  </View>
                  <Ionicons color={palette.muted} name="chevron-forward" size={14} />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.scopes}>
          {(['today', 'weekend', 'nearby'] as const).map((item) => (
            <ScopeButton
              count={scopeCounts[item]}
              key={item}
              onPress={() => setScope(item)}
              scope={item}
              selected={scope === item}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <PillButton
          active={activeFilterCount(filters) > 0}
          icon="options"
          title={
            activeFilterCount(filters) > 0
              ? formatSwiftPlaceholders(t('Filtres · %lld'), activeFilterCount(filters))
              : t('Filtres')
          }
          onPress={() => router.push('/filters' as never)}
        />
        <AppText color={palette.muted} variant="caption">
          {formatSwiftPlaceholders(t('%lld profils'), visible.length)}
        </AppText>
      </View>
      <SectionHeader title={t(scopeConfig[scope].label)} />
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
          <View style={styles.empty}>
            <EmptyState
              icon={
                scope === 'today'
                  ? 'moon-outline'
                  : scope === 'weekend'
                    ? 'calendar-outline'
                    : 'people-outline'
              }
              message={
                scope === 'today'
                  ? t("Personne n'a coché aujourd'hui. Regarde le week-end ou lance un SOS.")
                  : scope === 'weekend'
                    ? t("Aucun musicien n'a coché samedi ou dimanche pour l'instant.")
                    : t('Élargis le rayon ou retire un filtre pour voir plus de profils.')
              }
              title={
                scope === 'today'
                  ? t("Personne aujourd'hui")
                  : scope === 'weekend'
                    ? t('Personne ce week-end')
                    : t('Aucun musicien trouvé')
              }
            />
            {scope !== 'nearby' ? (
              <PillButton
                active
                icon={scope === 'today' ? 'calendar' : 'people'}
                title={scope === 'today' ? t('Voir ce week-end') : t('Voir tous les musiciens')}
                onPress={() => setScope(scope === 'today' ? 'weekend' : 'nearby')}
              />
            ) : null}
          </View>
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
  actionBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  availableDot: {
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 12,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 17,
    minWidth: 17,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -5,
    top: -4,
  },
  badgeText: { fontSize: 9, fontWeight: '900', lineHeight: 11 },
  circleAction: {
    alignItems: 'center',
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  empty: { alignItems: 'center', gap: spacing.control },
  greeting: { flex: 1, gap: spacing.tight },
  greetingTitle: { fontSize: 25, lineHeight: 29 },
  groupCopy: { flex: 1, gap: spacing.xxxs },
  groupName: { fontWeight: '800' },
  groupRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.control },
  groups: { gap: spacing.sm },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  headerContent: { gap: 22, paddingTop: spacing.xs },
  listContent: { paddingBottom: spacing.xl, paddingHorizontal: spacing.gutter },
  networkLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  quickAction: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.tight,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.sm,
  },
  quickActionIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  quickActionLabel: { fontWeight: '800' },
  quickActions: { gap: spacing.xs },
  scope: {
    alignItems: 'center',
    borderRadius: radii.chip,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.tight,
    minHeight: 42,
    paddingHorizontal: 13,
    paddingVertical: spacing.chip,
  },
  scopeCount: {
    alignItems: 'center',
    borderRadius: radii.chip,
    justifyContent: 'center',
    minHeight: 18,
    minWidth: 22,
    paddingHorizontal: spacing.tight,
  },
  scopeCountText: { fontFamily: typography.monoSemibold, fontSize: 11, lineHeight: 14 },
  scopeLabel: { fontWeight: '800' },
  scopes: { flexDirection: 'row', gap: spacing.chip, paddingVertical: spacing.hairline },
  search: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.chip,
    minHeight: 48,
    paddingHorizontal: spacing.cluster,
  },
  sectionLabel: {},
  separator: { height: spacing.gutter },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.cluster },
});
