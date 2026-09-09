import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { profileCompletion } from './profile-completion';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { ErrorState, LoadingState } from '@/components/ui/screen';
import {
  profileHandle,
  profileSocialUrl,
  schoolAcronym,
  shortProfileLevel,
  type ProfileSocialNetwork,
  type ProfileSummary,
} from '@/domain/profile';
import { schoolRoleLabel } from '@/features/schools/school-model';
import { useMySchoolAffiliations } from '@/features/schools/school-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, minimumTouchTarget, radii, typography } from '@/theme/tokens';

const socialIcons = {
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  x: 'logo-twitter',
  youtube: 'logo-youtube',
} as const;

function SectionLabel({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.sectionHeading}>
      <AppText color={palette.muted} style={styles.sectionLabel}>
        {title}
      </AppText>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
        >
          <AppText color={palette.electric} style={styles.actionLabel}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MyProfileDetail({ profile }: { profile: ProfileSummary }) {
  const { t, i18n } = useTranslation();
  const { palette, dark } = useDispoTheme();
  const { width, fontScale } = useWindowDimensions();
  const schools = useMySchoolAffiliations();
  const affiliations = (schools.data ?? []).filter((school) => school.status === 'active');
  const completion = profileCompletion(profile, affiliations);
  const firstName = profile.name.split(/\s+/)[0] || profile.name;
  const edit = () => router.push('/profile/edit' as never);
  const demos = () => router.push('/profile/demos' as never);
  const addDemo = () => router.push('/profile/demos?add=1' as never);
  const preview = () => router.push(`/profiles/${profile.id}` as never);
  const secondaryText = dark ? '#C7D2E4' : palette.bronze;
  const videos = profile.demoVideos ?? [];
  const socialLinks = (
    Object.entries(profile.socials ?? {}) as [ProfileSocialNetwork, string][]
  ).flatMap(([network, value]) => {
    const url = profileSocialUrl(network, value);
    return url ? [{ network, url }] : [];
  });
  const compactActions = width < 360 || fontScale > 1.2;
  const statLabels = [
    t('profile.ratingLabel', { count: profile.ratingCount }),
    t('profile.followerLabel', { count: profile.followerCount }),
    t('profile.collaborationLabel', { count: profile.collaborationCount }),
  ];
  const stats = [
    {
      value: profile.ratingAverage?.toFixed(1) ?? '—',
      onPress: () =>
        Alert.alert(
          t('Notes anonymes'),
          profile.ratingCount
            ? t('profile.ratingSummary', {
                count: profile.ratingCount,
                rating: profile.ratingAverage?.toFixed(1) ?? '—',
              })
            : t('Pas encore de note.'),
        ),
    },
    {
      value: String(profile.followerCount),
      onPress: () =>
        router.push(
          `/profiles/${profile.id}/followers?name=${encodeURIComponent(firstName)}` as never,
        ),
    },
    {
      value: String(profile.collaborationCount),
      onPress: () =>
        router.push(
          `/profiles/${profile.id}/played-with?name=${encodeURIComponent(firstName)}` as never,
        ),
    },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        <LinearGradient colors={[palette.electric, palette.jazzDeep]} style={styles.avatarRing}>
          <Avatar name={profile.name} size={68} uri={profile.photoUrl} />
        </LinearGradient>
        <View style={styles.identityCopy}>
          <View style={styles.nameRow}>
            <AppText style={styles.name} variant="display">
              {profile.name}
            </AppText>
            {profile.isPremium ? (
              <Ionicons
                accessibilityLabel={t('Premium')}
                name="sparkles"
                size={16}
                color={palette.electric}
              />
            ) : null}
          </View>
          <AppText color={palette.muted} style={styles.handle}>
            {profileHandle(profile.name)}
          </AppText>
          <AppText color={palette.muted} style={styles.meta}>
            {[
              profile.instruments[0] ? t(profile.instruments[0]) : null,
              profile.age ? formatSwiftPlaceholders(t('%lld ans'), profile.age) : null,
              [
                profile.neighborhood || profile.city,
                profile.country ? `(${profile.country})` : null,
              ]
                .filter(Boolean)
                .join(' '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      </View>

      {profile.bio.trim() ? (
        <AppText color={secondaryText} style={styles.bio}>
          {profile.bio.split(/(@[\p{L}\p{N}_.]+)/gu).map((part, index) => (
            <AppText
              key={index}
              color={part.startsWith('@') ? palette.electric : secondaryText}
              style={styles.bio}
            >
              {part}
            </AppText>
          ))}
        </AppText>
      ) : (
        <Pressable accessibilityRole="button" onPress={edit} style={styles.emptyBio}>
          <AppText color={palette.muted} style={styles.bio}>
            {t('Ajoute une phrase sur ce que tu joues')}
          </AppText>
        </Pressable>
      )}

      <View style={[styles.actions, compactActions && styles.actionsStacked]}>
        <Pressable
          accessibilityRole="button"
          onPress={edit}
          style={({ pressed }) => [
            styles.primaryAction,
            { backgroundColor: palette.electric },
            pressed && styles.pressed,
          ]}
        >
          <AppText color={billetInk} style={styles.primaryLabel}>
            {t('Modifier mon profil')}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={preview}
          style={({ pressed }) => [
            styles.preview,
            { backgroundColor: palette.cardElevated, borderColor: palette.border },
            pressed && styles.pressed,
          ]}
        >
          <AppText color={secondaryText} style={styles.primaryLabel}>
            {t('Aperçu')}
          </AppText>
        </Pressable>
      </View>

      <View style={[styles.stats, { backgroundColor: palette.card, borderColor: palette.border }]}>
        {stats.map((stat, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`${stat.value} ${statLabels[index]}`}
            onPress={stat.onPress}
            style={({ pressed }) => [
              styles.stat,
              index > 0 && { borderLeftWidth: 1, borderLeftColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.statValueRow}>
              {index === 0 ? <Ionicons color={palette.electric} name="star" size={13} /> : null}
              <AppText style={styles.statValue}>{stat.value}</AppText>
            </View>
            <AppText color={palette.muted} style={styles.statLabel}>
              {statLabels[index]}
            </AppText>
          </Pressable>
        ))}
      </View>

      {schools.isSuccess && completion.percent < 100 ? (
        <LinearGradient
          colors={[`${palette.concert}2E`, palette.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.completion, { borderColor: `${palette.electric}47` }]}
        >
          <View style={styles.completionHeading}>
            <AppText style={styles.completionTitle}>
              {t('Profil complété à {{percent}}%', { percent: completion.percent })}
            </AppText>
            <AppText color={palette.muted} style={styles.stepCount}>
              {t('profile.steps', { count: completion.missing.length })}
            </AppText>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('Complétion du profil')}
            accessibilityValue={{ min: 0, max: 100, now: completion.percent }}
            style={[styles.progressTrack, { backgroundColor: palette.border }]}
          >
            <LinearGradient
              colors={[palette.electric, palette.jam]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${completion.percent}%` }]}
            />
          </View>
          <View style={styles.completionActions}>
            {completion.missing.slice(0, 2).map((step, index) => (
              <Pressable
                key={step.id}
                accessibilityRole="button"
                onPress={() => router.push(step.route as never)}
                style={({ pressed }) => [
                  styles.completionAction,
                  {
                    backgroundColor: index === 0 ? `${palette.electric}1A` : palette.cardElevated,
                    borderColor: index === 0 ? `${palette.electric}52` : palette.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  color={index === 0 ? palette.electric : secondaryText}
                  style={styles.actionLabel}
                >
                  {t(step.label)}
                </AppText>
                <Ionicons
                  color={index === 0 ? palette.electric : palette.muted}
                  name="chevron-forward"
                  size={12}
                />
              </Pressable>
            ))}
          </View>
        </LinearGradient>
      ) : null}

      <View style={styles.section}>
        <SectionLabel title={t('Ce que je joue')} action={t('Modifier')} onPress={edit} />
        <View style={styles.chips}>
          {profile.instruments.map((instrument) => (
            <View
              key={instrument}
              style={[
                styles.instrument,
                { backgroundColor: `${palette.electric}1A`, borderColor: `${palette.electric}52` },
              ]}
            >
              <AppText style={styles.instrumentName}>{t(instrument)}</AppText>
              <AppText
                color={palette.electric}
                style={[styles.level, { backgroundColor: `${palette.electric}29` }]}
              >
                {t(shortProfileLevel(profile.instrumentLevels[instrument] ?? profile.level))}
              </AppText>
            </View>
          ))}
          {profile.genres.map((genre) => (
            <View
              key={genre}
              style={[
                styles.genre,
                { backgroundColor: palette.inset, borderColor: palette.border },
              ]}
            >
              <AppText color={secondaryText} style={styles.genreLabel}>
                {t(genre)}
              </AppText>
            </View>
          ))}
          {!profile.instruments.length && !profile.genres.length ? (
            <Pressable accessibilityRole="button" onPress={edit} style={styles.sectionAction}>
              <AppText color={palette.electric}>{t('Ajouter un instrument')}</AppText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel title={t('Mes démos')} action={t('Tout voir')} onPress={demos} />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={videos}
          keyExtractor={(video) => video.id}
          contentContainerStyle={styles.carouselContent}
          style={styles.carousel}
          snapToInterval={122}
          snapToAlignment="start"
          decelerationRate="fast"
          ListHeaderComponent={
            <Pressable
              accessibilityRole="button"
              onPress={addDemo}
              style={({ pressed }) => [
                styles.videoTile,
                styles.addVideo,
                { backgroundColor: `${palette.electric}0F`, borderColor: `${palette.electric}66` },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={palette.electric} name="add" size={25} />
              <AppText color={palette.electric} style={styles.addVideoLabel}>
                {t('Ajouter une vidéo')}
              </AppText>
            </Pressable>
          }
          renderItem={({ item: video, index }) => {
            const title = video.title || formatSwiftPlaceholders(t('Vidéo %lld'), index + 1);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('Lire')} · ${title}`}
                onPress={() =>
                  router.push({
                    pathname: '/profiles/[id]/video',
                    params: { id: profile.id, url: video.url, title },
                  } as never)
                }
                style={({ pressed }) => [
                  styles.videoTile,
                  { backgroundColor: palette.inset, borderColor: palette.border },
                  pressed && styles.pressed,
                ]}
              >
                {video.thumbUrl ? (
                  <Image
                    source={{ uri: video.thumbUrl }}
                    contentFit="cover"
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <Ionicons color={palette.muted} name="videocam-outline" size={28} />
                )}
                <View style={styles.playBadge}>
                  <Ionicons color="#FFFFFF" name="play" size={12} />
                </View>
                <View style={styles.videoCaption}>
                  <AppText color="#FFFFFF" numberOfLines={2} style={styles.videoTitle}>
                    {title}
                  </AppText>
                  {video.date ? (
                    <AppText color="#FFFFFF" style={styles.videoDate}>
                      {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'fr', {
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(`${video.date.slice(0, 10)}T12:00:00`))}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={styles.section}>
        <SectionLabel title={t('Écoles & affiliations')} />
        <View
          style={[styles.schools, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          {schools.isLoading ? (
            <LoadingState />
          ) : schools.isError ? (
            <ErrorState message={schools.error.message} onRetry={() => void schools.refetch()} />
          ) : (
            affiliations.map((affiliation) => {
              const verified = affiliation.verificationLevel === 'verified';
              const color = verified ? palette.jam : palette.signal;
              return (
                <Pressable
                  key={affiliation.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/schools/${affiliation.school.id}/join` as never)}
                  style={({ pressed }) => [
                    styles.schoolRow,
                    { borderBottomColor: palette.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.monogram, { backgroundColor: `${palette.electric}1F` }]}>
                    <AppText color={palette.electric} numberOfLines={1} style={styles.monogramText}>
                      {schoolAcronym(affiliation.school)}
                    </AppText>
                  </View>
                  <View style={styles.schoolCopy}>
                    <AppText style={styles.schoolName}>{affiliation.school.name}</AppText>
                    <AppText color={palette.muted} variant="caption">
                      {affiliation.roleLabel || t(schoolRoleLabel(affiliation.role))}
                    </AppText>
                  </View>
                  <AppText
                    color={color}
                    style={[styles.schoolStatus, { backgroundColor: `${color}24` }]}
                  >
                    {t(verified ? 'Vérifié' : 'À vérifier')}
                  </AppText>
                </Pressable>
              );
            })
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/schools' as never)}
            style={({ pressed }) => [styles.addSchool, pressed && styles.pressed]}
          >
            <Ionicons name="add" color={palette.muted} size={20} />
            <AppText color={secondaryText} style={styles.schoolCopy} variant="caption">
              {t('Ajouter une école ou un collectif')}
            </AppText>
            <Ionicons color={palette.muted} name="chevron-forward" size={14} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        {socialLinks.length ? <SectionLabel title={t('Liens')} /> : null}
        <View style={styles.links}>
          {socialLinks.map(({ network, url }) => (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={network}
              key={network}
              onPress={() => {
                void Linking.openURL(url).catch(() =>
                  Alert.alert(t('Erreur'), t('Impossible d’ouvrir ce lien.')),
                );
              }}
              style={({ pressed }) => [
                styles.link,
                { backgroundColor: palette.cardElevated, borderColor: palette.border },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={socialIcons[network]} color={secondaryText} size={19} />
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Ajouter un lien')}
            onPress={edit}
            style={({ pressed }) => [
              styles.link,
              styles.addLink,
              { backgroundColor: palette.cardElevated, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" color={palette.muted} size={21} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: { width: 72, height: 72, borderRadius: 36, padding: 2 },
  identityCopy: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 25, lineHeight: 30 },
  handle: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12.5, lineHeight: 18 },
  bio: { fontSize: 14, lineHeight: 21 },
  emptyBio: { minHeight: minimumTouchTarget, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  actionsStacked: { flexDirection: 'column' },
  primaryAction: {
    flex: 1,
    minHeight: minimumTouchTarget,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryLabel: { fontSize: 14.5, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  preview: {
    minHeight: minimumTouchTarget,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', paddingVertical: 10 },
  stat: {
    flex: 1,
    minWidth: 0,
    minHeight: minimumTouchTarget,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontFamily: typography.monoSemibold, fontSize: 19, lineHeight: 25 },
  statLabel: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  completion: { padding: 14, gap: 12, borderWidth: 1, borderRadius: 20 },
  completionHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  completionTitle: { fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  stepCount: { fontFamily: typography.mono, fontSize: 10, textTransform: 'uppercase' },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999 },
  completionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  completionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: minimumTouchTarget,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  section: { gap: 8 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: minimumTouchTarget,
  },
  sectionLabel: {
    flexShrink: 1,
    fontFamily: typography.monoSemibold,
    fontSize: 10.5,
    lineHeight: 16,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  sectionAction: { minHeight: minimumTouchTarget, justifyContent: 'center', paddingHorizontal: 2 },
  actionLabel: { flexShrink: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  instrument: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  instrumentName: { flexShrink: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  level: {
    fontFamily: typography.monoSemibold,
    fontSize: 10.5,
    lineHeight: 15,
    textTransform: 'uppercase',
    borderRadius: 9,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  genre: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8 },
  genreLabel: { fontSize: 13.5, lineHeight: 19 },
  carousel: { marginHorizontal: -20 },
  carouselContent: { paddingHorizontal: 20, gap: 10 },
  videoTile: {
    width: 112,
    height: 150,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addVideo: { borderStyle: 'dashed', gap: 10, padding: 12 },
  addVideoLabel: { fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  playBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    height: 26,
    width: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(5,8,20,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCaption: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 9,
    gap: 3,
    backgroundColor: 'rgba(5,8,20,0.72)',
  },
  videoTitle: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  videoDate: { fontFamily: typography.mono, fontSize: 9, lineHeight: 13 },
  schools: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, overflow: 'hidden' },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    minHeight: minimumTouchTarget,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monogram: {
    height: 38,
    width: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: { fontFamily: typography.monoSemibold, fontSize: 11 },
  schoolCopy: { flex: 1, minWidth: 70, gap: 2 },
  schoolName: { fontSize: 14.5, lineHeight: 20, fontWeight: '600' },
  schoolStatus: {
    fontFamily: typography.monoSemibold,
    fontSize: 10,
    lineHeight: 14,
    textTransform: 'uppercase',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
    overflow: 'hidden',
  },
  addSchool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    minHeight: minimumTouchTarget,
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  link: {
    width: minimumTouchTarget,
    height: minimumTouchTarget,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLink: { borderStyle: 'dashed' },
  pressed: { opacity: 0.7 },
});
