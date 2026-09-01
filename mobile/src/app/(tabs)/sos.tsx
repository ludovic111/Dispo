import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GigCard } from '@/features/gigs/gig-card';
import { openGigInstruments, triageHostedGigs, type GigSummary } from '@/features/gigs/gig-model';
import {
  countUnopenedCompatibleGigs,
  gigMatchesBadgeViewer,
  readOpenedGigIds,
} from '@/features/gigs/gig-opened-store';
import { loadSosShowAll, saveSosShowAll } from '@/features/gigs/gig-preferences';
import { useGigs } from '@/features/gigs/gig-queries';
import { useProfile } from '@/features/profiles/profile-queries';
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
  const profile = useProfile(userId, userId);
  const [segment, setSegment] = useState<Segment>('feed');
  const [showAll, setShowAll] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (userId) {
        void Promise.all([readOpenedGigIds(userId), loadSosShowAll(userId)]).then(
          ([ids, savedShowAll]) => {
            if (!active) return;
            setOpened(ids);
            setShowAll(savedShowAll);
          },
        );
      }
      return () => {
        active = false;
      };
    }, [userId]),
  );

  const changeShowAll = useCallback(
    (next: boolean) => {
      setShowAll(next);
      if (userId) void saveSosShowAll(userId, next);
    },
    [userId],
  );

  const gigs = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );
  const mine = useMemo(() => gigs.filter((gig) => gig.hostId === userId), [gigs, userId]);
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
  const visible = showAll ? publicFeed : matching;
  const freshCount = profile.data
    ? countUnopenedCompatibleGigs(publicFeed, profile.data, opened)
    : 0;
  const filteredOut = showAll ? 0 : publicFeed.length - matching.length;

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

  if (query.isLoading || profile.isLoading) {
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
  if (query.isExhaustiveError || profile.isError) {
    const message = query.error?.message ?? profile.error?.message ?? t('Chargement impossible.');
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
          onRetry={() => void Promise.all([query.refetch(), profile.refetch()])}
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
            onRefresh={() => void Promise.all([query.refetch(), profile.refetch()])}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
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
              {[false, true].map((all) => {
                const selected = showAll === all;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={String(all)}
                    onPress={() => changeShowAll(all)}
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
                      {all ? t('Tout') : t('Pour moi')}
                    </AppText>
                  </Pressable>
                );
              })}
              <View style={styles.scopeSpacer} />
              {filteredOut > 0 ? (
                <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                  {formatSwiftPlaceholders(t('%lld autre·s dans « Tout »'), filteredOut)}
                </AppText>
              ) : null}
            </View>

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
                  showAll
                    ? t('Un musicien te lâche ? Publie ton SOS avec le bouton +.')
                    : t(
                        "Rien à ton instrument et à ton niveau pour l'instant. Passe sur « Tout » pour voir le reste.",
                      )
                }
                title={showAll ? t('Aucun SOS en cours') : t('Aucun SOS pour toi')}
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

        {query.isFetchingNextPage ? (
          <LoadingState label={t('Chargement de la suite…')} />
        ) : query.hasNextPage ? (
          <DispoButton onPress={() => void query.fetchNextPage()} variant="secondary">
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
  content: { gap: spacing.md, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  directSection: { gap: spacing.sm },
  hostingSections: { gap: spacing.lg },
  list: { gap: spacing.md },
  mineHint: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingVertical: 9 },
  mineHintText: { flex: 1, fontWeight: '700' },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  scope: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  scopeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  scopeSpacer: { flex: 1 },
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
