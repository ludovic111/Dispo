import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { SchoolBadge } from './profile-card';
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
import { DispoButton } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import {
  profileHandle,
  profileSocialUrl,
  relationTags,
  type ProfileSocialNetwork,
  type ProfileSummary,
} from '@/domain/profile';
import { useAuth } from '@/features/auth/auth-context';
import { ensureDirectConversation } from '@/features/messages/message-repository';
import { SchoolAffiliationChip } from '@/features/schools/school-components';
import { useMySchoolAffiliations } from '@/features/schools/school-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, typography } from '@/theme/tokens';

const socialIcons: Record<ProfileSocialNetwork, React.ComponentProps<typeof Ionicons>['name']> = {
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  x: 'logo-twitter',
  youtube: 'logo-youtube',
};

function todayKey(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.sectionTitle}>
      <Ionicons color={palette.bronze} name={icon} size={16} />
      <AppText color={palette.bronze} style={styles.sectionHeading} variant="subheadline">
        {title}
      </AppText>
    </View>
  );
}

function ProfileManagementRow({
  color,
  icon,
  onPress,
  subtitle,
  title,
}: {
  color: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.managementRow, pressed && styles.pressed]}
    >
      <View style={[styles.managementIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons color={color} name={icon} size={19} />
      </View>
      <View style={styles.managementCopy}>
        <AppText style={styles.sectionHeading} variant="subheadline">
          {title}
        </AppText>
        <AppText color={palette.muted} numberOfLines={2} variant="caption">
          {subtitle}
        </AppText>
      </View>
      <Ionicons color={palette.muted} name="chevron-forward" size={17} />
    </Pressable>
  );
}

function MyProfileControls({
  availableDates,
  demoCount,
  tripCount,
}: {
  availableDates: string[];
  demoCount: number;
  tripCount: number;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const schools = useMySchoolAffiliations();
  const affiliations = schools.data ?? [];
  const nextDate = availableDates[0]
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', weekday: 'short' }).format(
        new Date(`${availableDates[0]}T12:00:00`),
      )
    : null;
  const availabilitySubtitle = nextDate
    ? availableDates.length === 1
      ? t('1 date cochée · {{date}}', { date: nextDate })
      : t('{{count}} dates cochées · prochaine {{date}}', {
          count: availableDates.length,
          date: nextDate,
        })
    : t('Aucune date cochée — ajoute les jours où tu peux dépanner.');
  return (
    <View style={styles.selfControls}>
      <Card padding={0}>
        <ProfileManagementRow
          color={palette.bronze}
          icon="pencil"
          onPress={() => router.push('/profile/edit' as never)}
          subtitle={t('Photo, bio, instruments, styles et réseaux sociaux')}
          title={t('Modifier mon profil')}
        />
        <View style={[styles.managementDivider, { backgroundColor: palette.border }]} />
        <ProfileManagementRow
          color={palette.jam}
          icon="flash"
          onPress={() => router.push('/profile/availability' as never)}
          subtitle={availabilitySubtitle}
          title={t('Mes disponibilités')}
        />
        <View style={[styles.managementDivider, { backgroundColor: palette.border }]} />
        <ProfileManagementRow
          color={palette.electric}
          icon="airplane-outline"
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
        <View style={[styles.managementDivider, { backgroundColor: palette.border }]} />
        <ProfileManagementRow
          color={palette.bronze}
          icon="play-circle-outline"
          onPress={() => router.push('/profile/demos' as never)}
          subtitle={
            demoCount
              ? demoCount === 1
                ? t('1 vidéo sur ton profil')
                : t('{{count}} vidéos sur ton profil', { count: demoCount })
              : t('Ajoute une vidéo pour montrer ce que tu joues.')
          }
          title={t('Mes démos')}
        />
      </Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/schools' as never)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Card>
          <View style={styles.schoolManageRow}>
            <View style={[styles.schoolManageIcon, { backgroundColor: `${palette.bronze}24` }]}>
              <Ionicons color={palette.bronze} name="business" size={20} />
            </View>
            <View style={styles.schoolManageCopy}>
              <AppText style={styles.sectionHeading} variant="subheadline">
                {affiliations.length > 0 ? t('Mes écoles') : t('Ajouter mon école de musique')}
              </AppText>
              <AppText color={palette.muted} variant="caption">
                {affiliations.length > 0
                  ? t('Gère tes affiliations et retrouve les membres.')
                  : t('Affiche ton affiliation et retrouve ses membres.')}
              </AppText>
            </View>
            <Ionicons
              color={palette.bronze}
              name={affiliations.length > 0 ? 'chevron-forward' : 'add-circle'}
              size={21}
            />
          </View>
          {affiliations.length > 0 ? (
            <View style={styles.tags}>
              {affiliations.map((affiliation) => (
                <SchoolAffiliationChip affiliation={affiliation} key={affiliation.id} />
              ))}
            </View>
          ) : null}
        </Card>
      </Pressable>
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

  return (
    <View style={styles.root}>
      <View style={styles.profileHeader}>
        <View>
          <Avatar name={profile.name} size={86} uri={profile.photoUrl} />
          {upcomingDates.length > 0 ? (
            <View
              style={[
                styles.availabilityDot,
                { backgroundColor: palette.jam, borderColor: palette.background },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.headerStats}>
          <View style={styles.stat}>
            <AppText style={styles.statValue}>
              {profile.ratingAverage ? `★ ${profile.ratingAverage.toFixed(1)}` : profile.level}
            </AppText>
            <AppText color={palette.muted} variant="caption2">
              {t(profile.ratingAverage ? 'note' : 'niveau')}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                `/profiles/${profile.id}/followers?name=${encodeURIComponent(firstName)}` as never,
              )
            }
            style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
          >
            <AppText style={styles.statValue}>{profile.followerCount}</AppText>
            <AppText color={palette.muted} variant="caption2">
              {t('abonnés')}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                `/profiles/${profile.id}/played-with?name=${encodeURIComponent(firstName)}` as never,
              )
            }
            style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
          >
            <AppText style={styles.statValue}>{profile.collaborationCount}</AppText>
            <AppText color={palette.muted} variant="caption2">
              {t('collabs')}
            </AppText>
          </Pressable>
        </View>
      </View>

      <View style={styles.identity}>
        <View style={styles.nameRow}>
          <AppText style={styles.name} variant="title2">
            {profile.name}
          </AppText>
          {profile.isDemo ? <Tag color={palette.bronze} label={t('Démo')} /> : null}
          {profile.isPremium ? (
            <Ionicons color={palette.electric} name="sparkles" size={17} />
          ) : null}
          {!self ? (
            <Pressable accessibilityLabel={t('Sécurité')} hitSlop={10} onPress={showSafetyMenu}>
              <Ionicons color={palette.muted} name="ellipsis-horizontal-circle" size={21} />
            </Pressable>
          ) : null}
        </View>
        {profile.playedWithFriend ? (
          <Tag color={palette.jam} label={t('A joué avec un ami')} />
        ) : null}
        <View style={styles.tags}>
          <AppText color={palette.bronze} variant="caption">
            {profileHandle(profile.name)}
          </AppText>
          {relationTags(profile).map((tag) => (
            <Tag key={tag} label={t(tag)} />
          ))}
          <Tag color={palette.bronze} label={t(profile.level)} />
        </View>
        <AppText color={palette.muted} variant="caption">
          {[
            profile.age ? formatSwiftPlaceholders(t('%lld ans'), profile.age) : null,
            profile.neighborhood || profile.city,
            profile.country,
          ]
            .filter(Boolean)
            .join(' · ') || t('Lieu non renseigné')}
        </AppText>
        {profile.bio ? <AppText variant="subheadline">{profile.bio}</AppText> : null}
        <View style={styles.tags}>
          {profile.genres.slice(0, 3).map((genre) => (
            <Tag color={palette.bronze} key={genre} label={t(genre)} />
          ))}
        </View>
        <View style={styles.tags}>
          {profile.instruments.map((instrument) => (
            <Tag
              color={palette.electric}
              key={instrument}
              label={`${t(instrument)} · ${t(profile.instrumentLevels[instrument] ?? profile.level)}`}
            />
          ))}
        </View>
        {profile.schools.length > 0 ? (
          <View style={styles.tags}>
            {profile.schools.map((school) => (
              <Pressable
                key={school.id}
                onPress={() => router.push(`/schools/${school.id}` as never)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <SchoolBadge school={school} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {profile.socials && Object.keys(profile.socials).length > 0 ? (
          <View style={styles.socials}>
            {(Object.entries(profile.socials) as [ProfileSocialNetwork, string][]).map(
              ([network, handle]) => {
                const url = profileSocialUrl(network, handle);
                if (!url) return null;
                return (
                  <Pressable
                    accessibilityLabel={network}
                    key={network}
                    onPress={() => void Linking.openURL(url)}
                    style={({ pressed }) => [
                      styles.social,
                      { backgroundColor: palette.inset, borderColor: palette.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons color={palette.text} name={socialIcons[network]} size={17} />
                  </Pressable>
                );
              },
            )}
          </View>
        ) : null}
      </View>

      {self ? (
        <MyProfileControls
          availableDates={futureDates}
          demoCount={profile.demoVideos?.length ?? 0}
          tripCount={upcomingTrips.length}
        />
      ) : (
        <View style={styles.actions}>
          {upcomingDates.length > 0 ? (
            <DispoButton
              icon="flash"
              onPress={() => router.push(`/gigs/request?profileId=${profile.id}` as never)}
              variant="signal"
            >
              {t('Demander un dépannage')}
            </DispoButton>
          ) : null}
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
            <Tag
              color={palette.jam}
              key={date}
              label={new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'short',
                weekday: 'short',
              }).format(new Date(`${date.slice(0, 10)}T12:00:00`))}
            />
          ))}
        </View>
      ) : null}

      {upcomingTrips.length > 0 ? (
        <Card style={styles.section}>
          <SectionTitle icon="airplane-outline" title={t('Disponible ailleurs')} />
          {upcomingTrips.map((trip) => (
            <View key={trip.id} style={styles.tripRow}>
              <Ionicons color={palette.bronze} name="location-outline" size={16} />
              <View style={styles.tripCopy}>
                <AppText style={styles.sectionHeading} variant="subheadline">
                  {[trip.postalCode, trip.city, trip.country].filter(Boolean).join(' · ')}
                </AppText>
                <AppText color={palette.muted} variant="caption">
                  {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                    new Date(`${trip.from}T12:00:00`),
                  )}
                  {' → '}
                  {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                    new Date(`${trip.to}T12:00:00`),
                  )}
                </AppText>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {social.data?.publicGroups.length ? (
        <Card style={styles.section}>
          <SectionTitle icon="people" title={t('Groupes')} />
          {social.data.publicGroups.map((group) => (
            <View key={group.id} style={styles.groupRow}>
              {group.photoUrl ? (
                <Image source={{ uri: group.photoUrl }} style={styles.groupAvatar} />
              ) : (
                <View
                  style={[
                    styles.groupAvatar,
                    styles.groupFallback,
                    { backgroundColor: `${palette.bronze}24` },
                  ]}
                >
                  <AppText>{group.emoji}</AppText>
                </View>
              )}
              <View style={styles.groupText}>
                <View style={styles.nameRow}>
                  <AppText numberOfLines={1} style={styles.sectionHeading} variant="subheadline">
                    {group.name}
                  </AppText>
                  {group.isLeader ? (
                    <Ionicons color={palette.bronze} name="diamond" size={11} />
                  ) : null}
                </View>
                <AppText color={palette.muted} variant="caption2">
                  {formatSwiftPlaceholders(t('%lld membres'), group.memberCount)}
                </AppText>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {profile.repertoire?.length ? (
        <Card style={styles.section}>
          <SectionTitle icon="musical-notes" title={t('Répertoire')} />
          {profile.repertoire.map((piece) => (
            <View key={piece} style={styles.repertoireRow}>
              <Ionicons color={palette.bronze} name="musical-note" size={14} />
              <AppText variant="subheadline">{piece}</AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {!self ? (
        <Card style={styles.section}>
          <View style={styles.rateHeader}>
            <SectionTitle
              icon={profile.level === 'Professionnel' ? 'star' : 'people'}
              title={formatSwiftPlaceholders(t('Tu as joué avec %@ ?'), firstName)}
            />
            {profile.ratingAverage ? (
              <Tag
                color={palette.bronze}
                label={`★ ${profile.ratingAverage.toFixed(1)} · ${profile.ratingCount}`}
              />
            ) : null}
          </View>
          <Pressable
            disabled={collaboration.isPending}
            onPress={() => {
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
            }}
            style={({ pressed }) => [
              styles.playedButton,
              { backgroundColor: `${hasPlayedWith ? palette.jam : palette.bronze}20` },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={hasPlayedWith ? palette.jam : palette.bronze}
              name={hasPlayedWith ? 'checkmark-circle' : 'add-circle-outline'}
              size={17}
            />
            <AppText
              color={hasPlayedWith ? palette.jam : palette.bronze}
              style={styles.playedLabel}
              variant="caption"
            >
              {hasPlayedWith ? t('On a joué ensemble') : t("Déclarer qu'on a joué ensemble")}
            </AppText>
          </Pressable>
          {profile.level === 'Professionnel' ? (
            <>
              <AppText color={palette.muted} variant="caption">
                {hasPlayedWith
                  ? t('Ta note reste anonyme et tu peux la retirer quand tu veux.')
                  : t(
                      "Déclare d'abord que vous avez joué ensemble : on ne note que quelqu'un qu'on a vu jouer.",
                    )}
              </AppText>
              <View style={[styles.stars, !hasPlayedWith && styles.disabled]}>
                {[1, 2, 3, 4, 5].map((stars) => (
                  <Pressable
                    accessibilityLabel={`${stars}/5`}
                    disabled={!canRateProfile(profile.level, hasPlayedWith) || rating.isPending}
                    key={stars}
                    onPress={() => rating.mutate(stars)}
                    style={({ pressed }) => pressed && styles.starPressed}
                  >
                    <Ionicons
                      color={(myRating ?? 0) >= stars ? palette.bronze : palette.muted}
                      name={(myRating ?? 0) >= stars ? 'star' : 'star-outline'}
                      size={28}
                    />
                  </Pressable>
                ))}
              </View>
              {myRating !== null ? (
                <Pressable onPress={() => rating.mutate(null)}>
                  <AppText color={palette.muted} variant="caption">
                    {t('Retirer ma note')}
                  </AppText>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.section}>
        <View style={styles.rateHeader}>
          <SectionTitle icon="play-outline" title={t('Démos')} />
          {self ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/profile/demos' as never)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <AppText color={palette.electric} style={styles.manageLabel} variant="caption">
                {t('Gérer')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {profile.demoVideos?.length ? (
          <View style={styles.videoGrid}>
            {profile.demoVideos.map((video, index) => (
              <Pressable
                accessibilityRole="button"
                key={video.id}
                onPress={() =>
                  router.push({
                    params: {
                      id: profile.id,
                      title: video.title || formatSwiftPlaceholders(t('Vidéo %lld'), index + 1),
                      url: video.url,
                    },
                    pathname: '/profiles/[id]/video',
                  } as never)
                }
                style={({ pressed }) => [styles.videoTile, pressed && styles.pressed]}
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
                <Ionicons color="#FFFFFF" name="play-circle" size={32} style={styles.videoPlay} />
                <View style={styles.videoCaption}>
                  <AppText color="#FFFFFF" numberOfLines={1} variant="caption2">
                    {video.title || formatSwiftPlaceholders(t('Vidéo %lld'), index + 1)}
                  </AppText>
                </View>
              </Pressable>
            ))}
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
                <Ionicons color="#FFFFFF" name="play" size={18} />
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
  availabilityDot: {
    borderRadius: 8,
    borderWidth: 2.5,
    bottom: 1,
    height: 16,
    position: 'absolute',
    right: 1,
    width: 16,
  },
  demoNote: { width: '100%' },
  disabled: { opacity: 0.45 },
  groupAvatar: { borderRadius: 20, height: 40, width: 40 },
  groupFallback: { alignItems: 'center', justifyContent: 'center' },
  groupRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  groupText: { flex: 1, gap: 2 },
  headerStats: { flex: 1, flexDirection: 'row' },
  identity: { alignItems: 'flex-start', gap: 7 },
  managementCopy: { flex: 1, gap: spacing.xxxs },
  managementDivider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  managementIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  managementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 66,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  manageLabel: { fontWeight: '800' },
  name: { flexShrink: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  playedButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  playedLabel: { fontWeight: '800' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.97 }] },
  profileHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.gutter },
  rateHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  repertoireRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  root: { gap: spacing.md },
  section: { gap: spacing.sm },
  sectionHeading: { flexShrink: 1, fontWeight: '800' },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  selfControls: { gap: spacing.xs },
  schoolManageCopy: { flex: 1, gap: spacing.xxxs },
  schoolManageIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  schoolManageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  social: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  socials: { flexDirection: 'row', gap: spacing.xs },
  starPressed: { transform: [{ scale: 0.85 }] },
  stars: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center' },
  statValue: { fontFamily: typography.monoSemibold, fontSize: 17, textAlign: 'center' },
  tags: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tripCopy: { flex: 1, gap: spacing.xxxs },
  tripRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  videoCaption: {
    backgroundColor: 'rgba(0,0,0,0.48)',
    bottom: 0,
    left: 0,
    paddingHorizontal: 5,
    paddingVertical: 3,
    position: 'absolute',
    right: 0,
  },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  videoPlay: { alignSelf: 'center' },
  videoTile: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 5,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '32.6%',
  },
});
