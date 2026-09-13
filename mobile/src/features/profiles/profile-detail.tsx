import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { MyProfileDetail } from './my-profile-detail';
import { ProfileSocialLinks, ProfileStatsCard, type ProfileStat } from './profile-shared';
import { canRateProfile } from './profile-social-model';
import {
  useBlockProfile,
  useProfileSocialState,
  useReportProfile,
  useSetProfileCollaboration,
  useSetProfileFollowing,
  useSetProfileRating,
} from './profile-social-queries';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { GrainOverlay } from '@/components/ui/dispo-background';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
import { scrimColor } from '@/components/ui/sheet';
import { Tag } from '@/components/ui/tag';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import {
  profileHandle,
  profileSocialUrl,
  relationTags,
  schoolAcronym,
  shortProfileLevel,
  type ProfileSocialNetwork,
  type ProfileSummary,
} from '@/domain/profile';
import { useAuth } from '@/features/auth/auth-context';
import { GigDirectRequestButton } from '@/features/gigs/gig-direct-request-button';
import { ensureDirectConversation } from '@/features/messages/message-repository';
import { PersonalRepertoireLink } from '@/features/repertoire/repertoire-screen';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import {
  disabledStyle,
  elevation,
  keyHighlight,
  keyStyle,
  minimumTouchTarget,
  onAccent,
  pressedStyle,
  radii,
  spacing,
  surfaceStyle,
  tint,
} from '@/theme/tokens';

function todayKey(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDay(locale: string, date: string, weekday = true): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(weekday ? { weekday: 'short' } : {}),
  }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

/**
 * Jour de disponibilité rendu comme une touche relevée : remplissage accent,
 * liseré clair, arête basse plus sombre, chiffre en mono. Un jour coché est
 * une touche enfoncée dans le calendrier, pas une simple étiquette.
 */
export function AvailabilityDayKey({ label }: { label: string }) {
  const { palette } = useDispoTheme();
  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[
        styles.dayKey,
        keyStyle(palette.accent, palette.accentDeep),
        { borderColor: palette.accentDeep },
        elevation(1, palette),
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.dayKeyHighlight, { backgroundColor: keyHighlight }]}
      />
      <AppText color={palette.accentInk} numberOfLines={1} variant="mono">
        {label}
      </AppText>
    </View>
  );
}

function TripRow({
  locale,
  place,
  trip,
}: {
  locale: string;
  place: string;
  trip: { from: string; to: string };
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.tripRow}>
      <Ionicons color={palette.bronze} name="location-outline" size={16} />
      <View style={styles.tripCopy}>
        <AppText variant="subheadline" weight="semibold">
          {place}
        </AppText>
        <AppText color={palette.muted} variant="caption">
          {`${formatDay(locale, trip.from, false)} → ${formatDay(locale, trip.to, false)}`}
        </AppText>
      </View>
    </View>
  );
}

export function ProfileAvailabilityOverview({ profile }: { profile: ProfileSummary }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const availableDates = profile.availableDates
    .filter((date) => date.slice(0, 10) >= todayKey())
    .sort();
  const trips = (profile.availabilityPlaces ?? [])
    .filter((trip) => trip.to >= todayKey())
    .sort((a, b) => a.from.localeCompare(b.from));
  const tripCount = trips.length;
  const nextDate = availableDates[0] ? formatDay(locale, availableDates[0]) : null;
  const availabilitySubtitle = nextDate
    ? availableDates.length === 1
      ? t('1 date cochée · {{date}}', { date: nextDate })
      : t('{{count}} dates cochées · prochaine {{date}}', {
          count: availableDates.length,
          date: nextDate,
        })
    : t('Aucune date cochée — ajoute les jours où tu peux dépanner.');
  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <ListRow
          leadingIcon="flash"
          leadingIconColor={palette.jam}
          onPress={() => router.push('/profile/availability' as never)}
          subtitle={availabilitySubtitle}
          title={t('Mes disponibilités')}
        />
        <ListRow
          leadingIcon="airplane-outline"
          onPress={() => router.push('/profile/travel' as never)}
          subtitle={
            tripCount
              ? tripCount === 1
                ? t('1 voyage enregistré')
                : t('{{count}} voyages enregistrés', { count: tripCount })
              : t('Ajoute tes prochains déplacements, séparément de tes dates.')
          }
          title={t('Mes voyages')}
        />
      </View>
      {availableDates.length > 0 ? (
        <Card style={styles.section}>
          <SectionHeader title={t('Mes disponibilités')} />
          <View style={styles.tags}>
            {availableDates.map((date) => (
              <AvailabilityDayKey key={date} label={formatDay(locale, date)} />
            ))}
          </View>
        </Card>
      ) : null}
      {trips.length > 0 ? (
        <Card style={styles.section}>
          <SectionHeader title={t('Mes voyages')} />
          {trips.map((trip) => (
            <TripRow
              key={trip.id}
              locale={locale}
              place={[trip.city, trip.country].filter(Boolean).join(' · ')}
              trip={trip}
            />
          ))}
        </Card>
      ) : null}
    </View>
  );
}

export function ProfileDetail({
  profile,
  self = false,
}: {
  profile: ProfileSummary;
  self?: boolean;
}) {
  return self ? <MyProfileDetail profile={profile} /> : <PublicProfileDetail profile={profile} />;
}

function PublicProfileDetail({ profile }: { profile: ProfileSummary }) {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const social = useProfileSocialState(profile.id);
  const following = useSetProfileFollowing(profile.id);
  const collaboration = useSetProfileCollaboration(profile.id);
  const rating = useSetProfileRating(profile.id);
  const report = useReportProfile(profile.id);
  const block = useBlockProfile(profile.id);
  const conversation = useMutation({
    mutationFn: () => ensureDirectConversation(session?.user.id ?? '', profile.id),
    onSuccess: (id) => router.push(`/messages/${id}?name=${encodeURIComponent(profile.name)}`),
  });
  const viewingOwnProfile = session?.user.id === profile.id;
  const isFollowing = profile.relationship === 'following' || profile.relationship === 'friend';
  const hasPlayedWith = social.data?.hasPlayedWith ?? false;
  const myRating = social.data?.myRating ?? null;
  const firstName = profile.name.split(/\s+/)[0] || profile.name;
  const futureDates = profile.availableDates
    .filter((date) => date.slice(0, 10) >= todayKey())
    .sort();
  const upcomingDates = futureDates.slice(0, 4);
  const upcomingTrips = (profile.availabilityPlaces ?? [])
    .filter((trip) => trip.to >= todayKey())
    .sort((left, right) => left.from.localeCompare(right.from));
  const actionError =
    conversation.error ??
    following.error ??
    collaboration.error ??
    rating.error ??
    report.error ??
    block.error;
  const socialLinks = (
    Object.entries(profile.socials ?? {}) as [ProfileSocialNetwork, string][]
  ).flatMap(([network, handle]) => {
    const url = profileSocialUrl(network, handle);
    return url ? [{ network, onPress: () => void Linking.openURL(url) }] : [];
  });
  const relations = relationTags(profile).filter(
    (tag) => !profile.schools.some((school) => schoolAcronym(school) === tag),
  );
  const stats: ProfileStat[] = [
    {
      label: t(profile.ratingAverage ? 'note' : 'niveau'),
      value: profile.ratingAverage
        ? `★ ${profile.ratingAverage.toFixed(1)}`
        : t(shortProfileLevel(profile.level)),
    },
    {
      label: t('abonnés'),
      onPress: () =>
        router.push(
          `/profiles/${profile.id}/followers?name=${encodeURIComponent(firstName)}` as never,
        ),
      value: String(profile.followerCount),
    },
    {
      label: t('collabs'),
      onPress: () =>
        router.push(
          `/profiles/${profile.id}/played-with?name=${encodeURIComponent(firstName)}` as never,
        ),
      value: String(profile.collaborationCount),
    },
  ];

  const showSafetyMenu = () => {
    Alert.alert(
      t('Sécurité'),
      formatSwiftPlaceholders(t('Que veux-tu faire avec le profil de %@ ?'), firstName),
      [
        {
          onPress: () =>
            report.mutate(t('Profil ou contenu inapproprié'), {
              onSuccess: () =>
                Alert.alert(
                  t('Signalement envoyé'),
                  t('Merci de nous aider à protéger la communauté.'),
                ),
            }),
          text: t('Signaler'),
        },
        {
          onPress: () =>
            Alert.alert(
              t('Bloquer ce musicien ?'),
              t('Vous ne verrez plus ce profil ni ses messages. Le musicien ne sera pas averti.'),
              [
                { style: 'cancel', text: t('Annuler') },
                {
                  onPress: () => block.mutate(undefined, { onSuccess: () => router.back() }),
                  style: 'destructive',
                  text: t('Bloquer'),
                },
              ],
            ),
          style: 'destructive',
          text: t('Bloquer'),
        },
        { style: 'cancel', text: t('Annuler') },
      ],
    );
  };

  const togglePlayedWith = () => {
    if (hasPlayedWith) {
      Alert.alert(
        t('Retirer la collaboration ?'),
        t('Ta note sera aussi retirée. Tu pourras la déclarer à nouveau plus tard.'),
        [
          { style: 'cancel', text: t('Annuler') },
          {
            onPress: () => collaboration.mutate(false),
            style: 'destructive',
            text: t('Retirer'),
          },
        ],
      );
    } else collaboration.mutate(true);
  };

  return (
    <View style={styles.root}>
      <Card style={styles.caseCard} tone="elevated">
        <View style={styles.profileHeader}>
          <View style={[styles.avatarWell, surfaceStyle(palette, 'default').container]}>
            <Avatar name={profile.name} size={80} uri={profile.photoUrl} />
            {upcomingDates.length > 0 ? (
              <View
                accessibilityLabel={t("Dispo aujourd'hui")}
                style={[
                  styles.availabilityDot,
                  { backgroundColor: palette.jam, borderColor: palette.card },
                ]}
              />
            ) : null}
          </View>
          <View style={styles.identityCopy}>
            <View style={styles.nameRow}>
              <AppText numberOfLines={2} style={styles.name} variant="title2">
                {profile.name}
              </AppText>
              {profile.isPremium ? <VerifiedBadge /> : null}
              {!viewingOwnProfile ? (
                <IconButton
                  accessibilityLabel={t('Sécurité')}
                  icon="ellipsis-horizontal-circle"
                  iconColor={palette.muted}
                  onPress={showSafetyMenu}
                  variant="plain"
                />
              ) : null}
            </View>
            <AppText color={palette.bronze} variant="mono">
              {profileHandle(profile.name)}
            </AppText>
            <AppText color={palette.muted} numberOfLines={2} variant="caption">
              {[
                profile.age ? formatSwiftPlaceholders(t('%lld ans'), profile.age) : null,
                profile.neighborhood || profile.city,
                profile.country,
              ]
                .filter(Boolean)
                .join(' · ') || t('Lieu non renseigné')}
            </AppText>
          </View>
        </View>
        <View style={styles.tags}>
          {profile.isDemo ? <Tag color={palette.bronze} label={t('Démo')} /> : null}
          {profile.instruments.length > 0 ? (
            profile.instruments.map((instrument) => (
              <Tag
                key={instrument}
                label={`${t(instrument)} · ${t(
                  shortProfileLevel(profile.instrumentLevels[instrument] ?? profile.level),
                )}`}
              />
            ))
          ) : (
            <Tag color={palette.bronze} label={t(shortProfileLevel(profile.level))} />
          )}
        </View>
        <ProfileStatsCard stats={stats} />
      </Card>

      <View style={styles.identity}>
        {profile.playedWithFriend ? (
          <Tag color={palette.jam} label={t('A joué avec un ami')} />
        ) : null}
        {relations.length > 0 ? (
          <View style={styles.tags}>
            {relations.map((tag) => (
              <Tag key={tag} label={t(tag)} />
            ))}
          </View>
        ) : null}
        {profile.bio ? <AppText variant="subheadline">{profile.bio}</AppText> : null}
        {profile.genres.length > 0 ? (
          <View style={styles.tags}>
            {profile.genres.slice(0, 3).map((genre) => (
              <Tag color={palette.bronze} key={genre} label={t(genre)} />
            ))}
          </View>
        ) : null}
        {profile.schools.length > 0 ? (
          <View style={styles.tags}>
            {profile.schools.map((school) => (
              <Pressable
                accessibilityLabel={school.name}
                accessibilityRole="button"
                hitSlop={spacing.xs}
                key={school.id}
                onPress={() => router.push(`/schools/${school.id}` as never)}
                style={({ pressed }) => pressed && pressedStyle}
              >
                <Tag color={palette.bronze} icon="school-outline" label={schoolAcronym(school)} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {socialLinks.length > 0 ? <ProfileSocialLinks links={socialLinks} /> : null}
      </View>

      {viewingOwnProfile ? null : (
        <View style={styles.actions}>
          {upcomingDates.length > 0 ? <GigDirectRequestButton profileId={profile.id} /> : null}
          <View style={styles.actionRow}>
            <View style={styles.actionHalf}>
              <DispoButton
                loading={following.isPending}
                onPress={() => following.mutate(!isFollowing)}
                variant={isFollowing ? 'secondary' : 'primary'}
              >
                {isFollowing ? t('Suivi') : t('Suivre')}
              </DispoButton>
            </View>
            <View style={styles.actionHalf}>
              <DispoButton
                loading={conversation.isPending}
                onPress={() => conversation.mutate()}
                variant="secondary"
              >
                {t('Contacter')}
              </DispoButton>
            </View>
          </View>
        </View>
      )}

      {actionError ? (
        <AppText color={palette.error} variant="caption">
          {t("L'action n'a pas pu être enregistrée. Réessaie dans un instant.")}
        </AppText>
      ) : null}

      {upcomingDates.length > 0 ? (
        <View style={styles.tags}>
          <Ionicons color={palette.muted} name="calendar-outline" size={14} />
          {upcomingDates.map((date) => (
            <AvailabilityDayKey key={date} label={formatDay(locale, date)} />
          ))}
        </View>
      ) : null}

      {upcomingTrips.length > 0 ? (
        <Card style={styles.section}>
          <SectionHeader title={t('Disponible ailleurs')} />
          {upcomingTrips.map((trip) => (
            <TripRow
              key={trip.id}
              locale={locale}
              place={[trip.postalCode, trip.city, trip.country].filter(Boolean).join(' · ')}
              trip={trip}
            />
          ))}
        </Card>
      ) : null}

      {social.data?.publicGroups.length ? (
        <Card style={styles.section}>
          <SectionHeader title={t('Groupes')} />
          {social.data.publicGroups.map((group) => (
            <ListRow
              accessory={
                group.isLeader ? (
                  <Ionicons color={palette.bronze} name="diamond" size={12} />
                ) : (
                  <View />
                )
              }
              key={group.id}
              leading={
                group.photoUrl ? (
                  <Image source={{ uri: group.photoUrl }} style={styles.groupAvatar} />
                ) : (
                  <View
                    style={[
                      styles.groupAvatar,
                      styles.groupFallback,
                      { backgroundColor: tint(palette.bronze, 0.14) },
                    ]}
                  >
                    <AppText>{group.emoji}</AppText>
                  </View>
                )
              }
              subtitle={formatSwiftPlaceholders(t('%lld membres'), group.memberCount)}
              title={group.name}
              tone="plain"
            />
          ))}
        </Card>
      ) : null}

      <PersonalRepertoireLink profileId={profile.id} self={false} />

      {!viewingOwnProfile ? (
        <Card style={styles.section}>
          <SectionHeader
            {...(profile.ratingAverage
              ? { subtitle: `★ ${profile.ratingAverage.toFixed(1)} · ${profile.ratingCount}` }
              : {})}
            title={formatSwiftPlaceholders(t('Tu as joué avec %@ ?'), firstName)}
          />
          <View style={styles.playedRow}>
            <DispoButton
              disabled={collaboration.isPending}
              icon={hasPlayedWith ? 'checkmark-circle' : 'add-circle-outline'}
              onPress={togglePlayedWith}
              size="compact"
              variant={hasPlayedWith ? 'secondary' : 'ghost'}
            >
              {hasPlayedWith ? t('On a joué ensemble') : t("Déclarer qu'on a joué ensemble")}
            </DispoButton>
          </View>
          {profile.level === 'Professionnel' ? (
            <>
              <AppText color={palette.muted} variant="caption">
                {hasPlayedWith
                  ? t('Ta note reste anonyme et tu peux la retirer quand tu veux.')
                  : t(
                      "Déclare d'abord que vous avez joué ensemble : on ne note que quelqu'un qu'on a vu jouer.",
                    )}
              </AppText>
              <View accessibilityRole="radiogroup" style={styles.stars}>
                {[1, 2, 3, 4, 5].map((stars) => {
                  const filled = (myRating ?? 0) >= stars;
                  const enabled = canRateProfile(profile.level, hasPlayedWith) && !rating.isPending;
                  return (
                    <Pressable
                      accessibilityLabel={`${stars}/5`}
                      accessibilityRole="radio"
                      accessibilityState={{ disabled: !enabled, selected: myRating === stars }}
                      disabled={!enabled}
                      key={stars}
                      onPress={() => rating.mutate(stars)}
                      style={({ pressed }) => [
                        styles.star,
                        pressed && pressedStyle,
                        !enabled && disabledStyle,
                      ]}
                    >
                      <Ionicons
                        color={filled ? palette.electric : palette.muted}
                        name={filled ? 'star' : 'star-outline'}
                        size={28}
                      />
                    </Pressable>
                  );
                })}
              </View>
              {myRating !== null ? (
                <View style={styles.playedRow}>
                  <DispoButton onPress={() => rating.mutate(null)} size="compact" variant="ghost">
                    {t('Retirer ma note')}
                  </DispoButton>
                </View>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title={t('Démos')} />
        {profile.demoVideos?.length ? (
          <View style={styles.videoGrid}>
            {profile.demoVideos.map((video, index) => {
              const title = video.title || formatSwiftPlaceholders(t('Vidéo %lld'), index + 1);
              return (
                <Pressable
                  accessibilityLabel={`${t('Lire')} · ${title}`}
                  accessibilityRole="button"
                  key={video.id}
                  onPress={() =>
                    router.push({
                      params: { id: profile.id, title, url: video.url },
                      pathname: '/profiles/[id]/video',
                    } as never)
                  }
                  style={({ pressed }) => [styles.videoTile, pressed && pressedStyle]}
                >
                  {video.thumbUrl ? (
                    <Image
                      contentFit="cover"
                      source={{ uri: video.thumbUrl }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bronze }]} />
                  )}
                  <GrainOverlay />
                  <Ionicons color={onAccent} name="play-circle" size={32} />
                  <View style={styles.videoCaption}>
                    <AppText color={onAccent} numberOfLines={1} variant="caption2">
                      {title}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : profile.isDemo ? (
          <View style={styles.videoGrid}>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={[
                  styles.videoTile,
                  { backgroundColor: index % 2 ? palette.electric : palette.bronze },
                ]}
              >
                <GrainOverlay />
                <Ionicons color={onAccent} name="play" size={18} />
              </View>
            ))}
            <AppText color={palette.muted} style={styles.demoNote} variant="caption2">
              {t("Aperçu de démonstration — profil d'exemple.")}
            </AppText>
          </View>
        ) : (
          <AppText color={palette.muted} variant="caption">
            {t('Pas encore de vidéo de démo sur ce profil.')}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionHalf: { flex: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.xs },
  actions: { gap: spacing.xs },
  // Anneau relevé autour de la photo : la surface `default` posée dans l'étui `elevated`.
  avatarWell: { borderRadius: radii.round, padding: spacing.xxs },
  // Pastille de présence : l'anneau de 2 pt la détache de la photo (couleur de la carte).
  availabilityDot: {
    borderRadius: radii.round,
    borderWidth: 2,
    bottom: spacing.xxs,
    height: 16,
    position: 'absolute',
    right: spacing.xxs,
    width: 16,
  },
  caseCard: { gap: spacing.sm },
  // Touche accent : arête fine `accentDeep`, arête basse de 2 pt posée par `keyStyle`.
  dayKey: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  dayKeyHighlight: { height: 1, left: radii.xs, position: 'absolute', right: radii.xs, top: 0 },
  demoNote: { width: '100%' },
  groupAvatar: { borderRadius: radii.round, height: 40, width: 40 },
  groupFallback: { alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'flex-start', gap: spacing.xs },
  identityCopy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  name: { flexShrink: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  playedRow: { alignSelf: 'flex-start' },
  profileHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  root: { gap: spacing.md },
  section: { gap: spacing.sm },
  star: {
    alignItems: 'center',
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  stars: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  tags: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.tight },
  tripCopy: { flex: 1, gap: spacing.xxs },
  tripRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  videoCaption: {
    backgroundColor: scrimColor,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.tight,
    paddingVertical: spacing.xxs,
    position: 'absolute',
    right: 0,
  },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  videoTile: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: radii.xs,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '32%',
  },
});
