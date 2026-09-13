import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAuth } from '@/features/auth/auth-context';
import { GigCard } from '@/features/gigs/gig-card';
import {
  openGigInstruments,
  sortGigsByMatch,
  triageHostedGigs,
  type GigMatchInfo,
  type GigSummary,
} from '@/features/gigs/gig-model';
import { countUnopenedMatchedGigs, readOpenedGigIds } from '@/features/gigs/gig-opened-store';
import { useGigs, useHostedGigs, useMyGigMatches } from '@/features/gigs/gig-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

type Segment = 'feed' | 'hosting';

function GigList({
  gigs,
  matches,
  opened,
}: {
  gigs: GigSummary[];
  matches?: ReadonlyMap<string, GigMatchInfo> | undefined;
  opened: ReadonlySet<string>;
}) {
  return (
    <View style={styles.list}>
      {gigs.map((gig) => (
        <GigCard
          gig={{ ...gig, isFresh: !opened.has(gig.id) }}
          key={gig.id}
          match={matches?.get(gig.id)}
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
  const matchesQuery = useMyGigMatches();
  const { refetch: refetchFeed } = query;
  const { refetch: refetchHosted } = hostedQuery;
  const { refetch: refetchMatches } = matchesQuery;
  const [segment, setSegment] = useState<Segment>('feed');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (userId) {
        void Promise.all([refetchFeed(), refetchHosted(), refetchMatches()]);
        void readOpenedGigIds(userId).then((ids) => {
          if (active) setOpened(ids);
        });
      }
      return () => {
        active = false;
      };
    }, [refetchFeed, refetchHosted, refetchMatches, userId]),
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
  // Le serveur score chaque annonce pour le viewer : compatibles d'abord, puis par date.
  const matches = useMemo(
    () =>
      new Map(
        (matchesQuery.data ?? [])
          .filter((item) => item.match.instruments.length > 0)
          .map((item) => [item.gigId, item.match] as const),
      ),
    [matchesQuery.data],
  );
  const visible = useMemo(
    () =>
      sortGigsByMatch(
        publicFeed,
        new Map([...matches].map(([gigId, match]) => [gigId, match.score])),
      ),
    [matches, publicFeed],
  );
  const freshCount = matchesQuery.data
    ? countUnopenedMatchedGigs(matchesQuery.data, userId, opened)
    : 0;

  const add = (
    <DispoButton
      accessibilityLabel={t('Publier un SOS')}
      icon="add"
      onPress={() => router.push('/gigs/create')}
      size="compact"
      variant="signal"
    >
      {t('SOS')}
    </DispoButton>
  );

  if (query.isLoading || hostedQuery.isLoading) {
    return (
      <Screen nativeTabRoot>
        <ScreenHeader action={add} icon="flash" title={t('SOS dépannage')} />
        <LoadingState label={t('Chargement des annonces…')} />
      </Screen>
    );
  }
  if (query.isExhaustiveError || hostedQuery.isExhaustiveError) {
    const message =
      query.error?.message ?? hostedQuery.error?.message ?? t('Chargement impossible.');
    return (
      <Screen nativeTabRoot>
        <ScreenHeader action={add} icon="flash" title={t('SOS dépannage')} />
        <ErrorState
          message={message}
          onRetry={() =>
            void Promise.all([query.refetch(), hostedQuery.refetch(), matchesQuery.refetch()])
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
              void Promise.all([query.refetch(), hostedQuery.refetch(), matchesQuery.refetch()])
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
              ? visible.length === 1
                ? t('1 concert cherche un musicien')
                : formatSwiftPlaceholders(t('%lld concerts cherchent un musicien'), visible.length)
              : t('Accepte ou écarte tes candidats')
          }
          title={t('SOS dépannage')}
        />

        <SegmentedControl
          onChange={setSegment}
          options={[
            { count: freshCount, label: t('SOS'), value: 'feed' },
            { count: hosting.pendingApplicantCount, label: t('Mes SOS'), value: 'hosting' },
          ]}
          value={segment}
        />

        {segment === 'feed' ? (
          <>
            {mine.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setSegment('hosting')}
                style={({ pressed }) => pressed && pressedStyle}
              >
                <Card padding={spacing.sm} tone="inset">
                  <View style={styles.mineHint}>
                    <Ionicons color={palette.bronze} name="megaphone" size={14} />
                    <AppText
                      color={palette.bronze}
                      style={styles.flex}
                      variant="footnote"
                      weight="semibold"
                    >
                      {mine.length === 1
                        ? t('Ton annonce est dans « Mes SOS »')
                        : formatSwiftPlaceholders(
                            t('Tes %lld annonces sont dans « Mes SOS »'),
                            mine.length,
                          )}
                    </AppText>
                    <Ionicons color={palette.bronze} name="chevron-forward" size={13} />
                  </View>
                </Card>
              </Pressable>
            ) : null}

            {visible.length > 0 ? (
              <GigList gigs={visible} matches={matches} opened={opened} />
            ) : (
              <EmptyState
                icon="flash-outline"
                message={t('Un musicien te lâche ? Publie ton SOS avec le bouton +.')}
                title={t('Aucun SOS en cours')}
              />
            )}
          </>
        ) : mine.length > 0 ? (
          <View style={styles.hostingSections}>
            {hosting.hosted.length > 0 ? <GigList gigs={hosting.hosted} opened={opened} /> : null}
            {hosting.sentDirect.length > 0 ? (
              <View style={styles.directSection}>
                <SectionHeader
                  subtitle={t('Un musicien précis, à qui tu as demandé de dépanner')}
                  title={t('Demandes envoyées')}
                />
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
  content: { gap: spacing.md, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  directSection: { gap: spacing.sm, width: '100%' },
  flex: { flex: 1 },
  hostingSections: { gap: spacing.lg, width: '100%' },
  list: { gap: spacing.md, width: '100%' },
  mineHint: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
