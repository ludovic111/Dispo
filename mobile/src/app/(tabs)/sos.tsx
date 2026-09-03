import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { GigCard } from '@/features/gigs/gig-card';
import {
  gigsForScope,
  openGigInstruments,
  triageHostedGigs,
  type GigSummary,
  type SosFeedScope,
} from '@/features/gigs/gig-model';
import {
  countUnopenedCompatibleGigs,
  gigMatchesBadgeViewer,
  readOpenedGigIds,
} from '@/features/gigs/gig-opened-store';
import { loadSosScope, saveSosScope } from '@/features/gigs/gig-preferences';
import { useGigs, useHostedGigs } from '@/features/gigs/gig-queries';
import { useProfile } from '@/features/profiles/profile-queries';
import { useSchoolDirectory } from '@/features/schools/school-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

type Segment = 'feed' | 'hosting';

function SegmentButton({
  count,
  label,
  onPress,
  selected,
}: {
  count: number;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        selected && {
          backgroundColor: `${palette.electric}1F`,
          borderColor: `${palette.electric}66`,
        },
        pressed && styles.pressed,
      ]}
    >
      <AppText color={selected ? palette.electric : palette.muted} variant="subheadline">
        {label}
        {count > 0 ? ` · ${count}` : ''}
      </AppText>
    </Pressable>
  );
}

function GigList({ gigs, opened }: { gigs: GigSummary[]; opened: ReadonlySet<string> }) {
  return (
    <View style={styles.list}>
      {gigs.map((gig) => (
        <GigCard
          gig={{ ...gig, isFresh: !opened.has(gig.id) }}
          key={gig.id}
          onPress={() => router.push(`/gigs/${gig.id}`)}
        />
      ))}
    </View>
  );
}

export default function GigsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const query = useGigs();
  const hostedQuery = useHostedGigs();
  const schoolDirectory = useSchoolDirectory();
  const { refetch: refetchFeed } = query;
  const { refetch: refetchHosted } = hostedQuery;
  const profile = useProfile(userId, userId);
  const [segment, setSegment] = useState<Segment>('feed');
  const [scope, setScope] = useState<SosFeedScope>('matching');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const schoolSelectionInitialized = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (userId) {
        void Promise.all([refetchFeed(), refetchHosted()]);
        void Promise.all([readOpenedGigIds(userId), loadSosScope(userId)]).then(
          ([ids, savedScope]) => {
            if (!active) return;
            setOpened(ids);
            setScope(savedScope);
          },
        );
      }
      return () => {
        active = false;
      };
    }, [refetchFeed, refetchHosted, userId]),
  );

  const changeScope = useCallback(
    (next: SosFeedScope) => {
      setScope(next);
      if (userId) void saveSosScope(userId, next);
    },
    [userId],
  );

  const gigs = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );
  const mine = useMemo(
    () => hostedQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [hostedQuery.data?.pages],
  );
  const hosting = useMemo(() => triageHostedGigs(mine), [mine]);
  const publicFeed = useMemo(
    () =>
      gigs.filter(
        (gig) =>
          gig.hostId !== userId && gig.targetId === null && openGigInstruments(gig).length > 0,
      ),
    [gigs, userId],
  );
  const matching = useMemo(
    () =>
      profile.data
        ? publicFeed.filter((gig) => gigMatchesBadgeViewer(gig, profile.data))
        : publicFeed,
    [profile.data, publicFeed],
  );
  const viewerSchoolIds = useMemo(
    () => profile.data?.schools.map((school) => school.id) ?? [],
    [profile.data?.schools],
  );
  const schools = useMemo(
    () => schoolDirectory.data?.pages.flatMap((page) => page.items) ?? [],
    [schoolDirectory.data?.pages],
  );
  useEffect(() => {
    if (!profile.data || schoolSelectionInitialized.current) return;
    schoolSelectionInitialized.current = true;
    setSelectedSchoolIds(viewerSchoolIds);
  }, [profile.data, viewerSchoolIds]);
  const visible = useMemo(
    () => gigsForScope(publicFeed, matching, scope, selectedSchoolIds),
    [matching, publicFeed, scope, selectedSchoolIds],
  );
  const freshCount = profile.data
    ? countUnopenedCompatibleGigs(publicFeed, profile.data, opened)
    : 0;
  const filteredOut = scope === 'matching' ? publicFeed.length - matching.length : 0;

  const add = (
    <Pressable
      accessibilityLabel={t('Publier un SOS')}
      accessibilityRole="button"
      onPress={() => router.push('/gigs/create')}
      style={({ pressed }) => [
        styles.add,
        { backgroundColor: palette.signal },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color="#FFFFFF" name="add" size={15} />
      <AppText color="#FFFFFF" style={styles.addText} variant="caption">
        {t('SOS')}
      </AppText>
    </Pressable>
  );

  if (query.isLoading || hostedQuery.isLoading || profile.isLoading) {
    return (
      <Screen nativeTabRoot>
        <ScreenHeader
          action={add}
          icon="flash"
          subtitle={t('Dépannage')}
          title={t('SOS dépannage')}
        />
        <LoadingState label={t('Chargement des annonces…')} />
      </Screen>
    );
  }
  if (query.isExhaustiveError || hostedQuery.isExhaustiveError || profile.isError) {
    const message =
      query.error?.message ??
      hostedQuery.error?.message ??
      profile.error?.message ??
      t('Chargement impossible.');
    return (
      <Screen nativeTabRoot>
        <ScreenHeader
          action={add}
          icon="flash"
          subtitle={t('Dépannage')}
          title={t('SOS dépannage')}
        />
        <ErrorState
          message={message}
          onRetry={() =>
            void Promise.all([query.refetch(), hostedQuery.refetch(), profile.refetch()])
          }
        />
      </Screen>
    );
  }

  return (
    <Screen nativeTabRoot>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[palette.electric]}
            onRefresh={() =>
              void Promise.all([query.refetch(), hostedQuery.refetch(), profile.refetch()])
            }
            refreshing={
              (query.isRefetching && !query.isFetchingNextPage) ||
              (hostedQuery.isRefetching && !hostedQuery.isFetchingNextPage)
            }
            tintColor={palette.electric}
          />
        }
      >
        <ScreenHeader
          action={add}
          icon="flash"
          inset={false}
          subtitle={
            segment === 'feed'
              ? formatSwiftPlaceholders(t('%lld concerts cherchent un musicien'), visible.length)
              : t('Accepte ou écarte tes candidats')
          }
          title={t('SOS dépannage')}
        />

        <View style={[styles.segmented, { backgroundColor: palette.cardMuted }]}>
          <SegmentButton
            count={freshCount}
            label={t('SOS')}
            onPress={() => setSegment('feed')}
            selected={segment === 'feed'}
          />
          <SegmentButton
            count={hosting.pendingApplicantCount}
            label={t('Mes SOS')}
            onPress={() => setSegment('hosting')}
            selected={segment === 'hosting'}
          />
        </View>

        {segment === 'feed' ? (
          <>
            <View style={styles.scopeRow}>
              {(
                [
                  ['matching', t('Pour moi')],
                  ['school', t('École')],
                  ['all', t('Tout')],
                ] as const
              ).map(([value, label]) => {
                const selected = scope === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={value}
                    onPress={() => changeScope(value)}
                    style={({ pressed }) => [
                      styles.scope,
                      {
                        backgroundColor: selected ? `${palette.electric}1F` : palette.cardMuted,
                        borderColor: selected ? `${palette.electric}66` : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText color={selected ? palette.electric : palette.muted} variant="caption">
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {scope === 'school' ? (
              <Card style={styles.schoolFilter}>
                <View style={styles.schoolHeader}>
                  <SectionHeader
                    subtitle={`${selectedSchoolIds.length}`}
                    title={t('Écoles de musique')}
                  />
                  {selectedSchoolIds.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSelectedSchoolIds([])}
                      style={({ pressed }) => [styles.clearSchools, pressed && styles.pressed]}
                    >
                      <Ionicons color={palette.electric} name="close-circle-outline" size={16} />
                      <AppText
                        color={palette.electric}
                        style={styles.clearSchoolsLabel}
                        variant="caption"
                      >
                        {t('Effacer les écoles')}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
                {schoolDirectory.isLoading ? (
                  <AppText color={palette.muted} variant="caption">
                    {t('Chargement des écoles…')}
                  </AppText>
                ) : schoolDirectory.isError ? (
                  <View style={styles.schoolError}>
                    <AppText
                      color={palette.signal}
                      style={styles.schoolErrorText}
                      variant="caption"
                    >
                      {t("L'annuaire des écoles n'a pas pu être chargé.")}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void schoolDirectory.refetch()}
                      style={styles.schoolRetry}
                    >
                      <AppText color={palette.electric} variant="caption">
                        {t('Réessayer')}
                      </AppText>
                    </Pressable>
                  </View>
                ) : schools.length > 0 ? (
                  <>
                    <View style={styles.schoolChoices}>
                      {schools.map((school) => (
                        <ChoiceChip
                          key={school.id}
                          label={school.name}
                          onPress={() =>
                            setSelectedSchoolIds((current) =>
                              current.includes(school.id)
                                ? current.filter((id) => id !== school.id)
                                : [...current, school.id],
                            )
                          }
                          selected={selectedSchoolIds.includes(school.id)}
                        />
                      ))}
                    </View>
                    {schoolDirectory.hasNextPage ? (
                      <DispoButton
                        loading={schoolDirectory.isFetchingNextPage}
                        onPress={() => void schoolDirectory.fetchNextPage()}
                        variant="secondary"
                      >
                        {t('Charger plus')}
                      </DispoButton>
                    ) : null}
                  </>
                ) : (
                  <AppText color={palette.muted} variant="caption">
                    {t("Aucune école active dans l'annuaire.")}
                  </AppText>
                )}
              </Card>
            ) : null}
            {filteredOut > 0 ? (
              <AppText
                color={palette.muted}
                numberOfLines={1}
                style={styles.scopeHint}
                variant="caption2"
              >
                {formatSwiftPlaceholders(t('%lld autre·s dans « Tout »'), filteredOut)}
              </AppText>
            ) : null}

            {mine.length > 0 ? (
              <Pressable
                onPress={() => setSegment('hosting')}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Card style={[styles.mineHint, { backgroundColor: `${palette.bronze}16` }]}>
                  <Ionicons color={palette.bronze} name="megaphone" size={14} />
                  <AppText color={palette.bronze} style={styles.mineHintText} variant="caption">
                    {formatSwiftPlaceholders(
                      t('Tes %lld annonce·s sont dans « Mes SOS »'),
                      mine.length,
                    )}
                  </AppText>
                  <Ionicons color={palette.bronze} name="chevron-forward" size={13} />
                </Card>
              </Pressable>
            ) : null}

            {visible.length > 0 ? (
              <GigList gigs={visible} opened={opened} />
            ) : (
              <EmptyState
                icon="flash-outline"
                message={
                  scope === 'all'
                    ? t('Un musicien te lâche ? Publie ton SOS avec le bouton +.')
                    : scope === 'school'
                      ? selectedSchoolIds.length > 0
                        ? t('Aucun SOS ne correspond aux écoles sélectionnées.')
                        : t('Sélectionne une ou plusieurs écoles pour filtrer les SOS.')
                      : t(
                          "Rien à ton instrument et à ton niveau pour l'instant. Passe sur « Tout » pour voir le reste.",
                        )
                }
                title={
                  scope === 'all'
                    ? t('Aucun SOS en cours')
                    : scope === 'school'
                      ? selectedSchoolIds.length > 0
                        ? t('Aucun SOS pour ces écoles')
                        : t('Aucune école sélectionnée')
                      : t('Aucun SOS pour toi')
                }
              />
            )}
          </>
        ) : mine.length > 0 ? (
          <View style={styles.hostingSections}>
            {hosting.hosted.length > 0 ? <GigList gigs={hosting.hosted} opened={opened} /> : null}
            {hosting.sentDirect.length > 0 ? (
              <View style={styles.directSection}>
                <AppText color={palette.bronze} variant="title">
                  {t('Demandes envoyées')}
                </AppText>
                <AppText color={palette.muted} variant="caption">
                  {t('Un musicien précis, à qui tu as demandé de dépanner')}
                </AppText>
                <GigList gigs={hosting.sentDirect} opened={opened} />
              </View>
            ) : null}
          </View>
        ) : (
          <EmptyState
            icon="megaphone-outline"
            message={t(
              'Publie un SOS avec le bouton + : les candidats arrivent ici, tu acceptes ou tu écartes en un tap.',
            )}
            title={t("Tu n'organises rien pour l'instant")}
          />
        )}

        {(segment === 'feed' ? query : hostedQuery).isFetchingNextPage ? (
          <LoadingState label={t('Chargement de la suite…')} />
        ) : (segment === 'feed' ? query : hostedQuery).hasNextPage ? (
          <DispoButton
            onPress={() =>
              void (segment === 'feed' ? query.fetchNextPage() : hostedQuery.fetchNextPage())
            }
            variant="secondary"
          >
            {t('Charger plus')}
          </DispoButton>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 13,
  },
  addText: { fontWeight: '900' },
  clearSchools: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.compact,
    minHeight: 36,
  },
  clearSchoolsLabel: { fontWeight: '800' },
  content: { gap: spacing.md, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  directSection: { gap: spacing.sm, width: '100%' },
  hostingSections: { gap: spacing.lg, width: '100%' },
  list: { gap: spacing.md, width: '100%' },
  mineHint: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingVertical: 9 },
  mineHintText: { flex: 1, fontWeight: '700' },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  scope: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  scopeRow: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.xs },
  scopeHint: { textAlign: 'right' },
  schoolChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  schoolError: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  schoolErrorText: { flex: 1 },
  schoolFilter: { gap: spacing.sm },
  schoolHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  schoolRetry: { minHeight: 36, paddingHorizontal: spacing.xs, justifyContent: 'center' },
  segment: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.button,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
  },
  segmented: { borderRadius: radii.button, flexDirection: 'row', padding: 3 },
});
