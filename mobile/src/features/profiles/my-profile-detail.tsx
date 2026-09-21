import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ProfileCollaboratorsCard } from './profile-collaborators-card';
import { profileCompletion } from './profile-completion';
import { ProfileSocialLinks, ProfileStatsCard, type ProfileStat } from './profile-shared';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { GrainOverlay } from '@/components/ui/dispo-background';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { scrimColor } from '@/components/ui/sheet';
import { Tag } from '@/components/ui/tag';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import {
  profileHandle,
  profileSocialUrl,
  shortProfileLevel,
  type ProfileSocialNetwork,
  type ProfileSummary,
} from '@/domain/profile';
import { SchoolAvatar } from '@/features/schools/school-components';
import { schoolRoleLabel } from '@/features/schools/school-model';
import { useMySchoolAffiliations } from '@/features/schools/school-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import {
  insetStyle,
  minimumTouchTarget,
  onAccent,
  pressedStyle,
  radii,
  spacing,
  surfaceStyle,
  tint,
} from '@/theme/tokens';

const demoTileWidth = 112;

export function MyProfileDetail({ profile }: { profile: ProfileSummary }) {
  const { t, i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const schools = useMySchoolAffiliations();
  const affiliations = (schools.data ?? []).filter((school) => school.status === 'active');
  const completion = profileCompletion(profile, affiliations);
  const firstName = profile.name.split(/\s+/)[0] || profile.name;
  const edit = () => router.push('/profile/edit' as never);
  const demos = () => router.push('/profile/demos' as never);
  const addDemo = () => router.push('/profile/demos?add=1' as never);
  const preview = () => router.push(`/profiles/${profile.id}` as never);
  const videos = profile.demoVideos ?? [];
  const socialLinks = (
    Object.entries(profile.socials ?? {}) as [ProfileSocialNetwork, string][]
  ).flatMap(([network, value]) => {
    const url = profileSocialUrl(network, value);
    return url
      ? [
          {
            network,
            onPress: () => {
              void Linking.openURL(url).catch(() =>
                Alert.alert(t('Erreur'), t('Impossible d’ouvrir ce lien.')),
              );
            },
          },
        ]
      : [];
  });
  const stats: ProfileStat[] = [
    {
      icon: 'star',
      label: t('profile.ratingLabel', { count: profile.ratingCount }),
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
      value: profile.ratingAverage?.toFixed(1) ?? '—',
    },
    {
      label: t('profile.followerLabel', { count: profile.followerCount }),
      onPress: () =>
        router.push(
          `/profiles/${profile.id}/followers?name=${encodeURIComponent(firstName)}` as never,
        ),
      value: String(profile.followerCount),
    },
    {
      label: t('profile.collaborationLabel', { count: profile.collaborationCount }),
      onPress: () =>
        router.push(
          `/profiles/${profile.id}/played-with?name=${encodeURIComponent(firstName)}` as never,
        ),
      value: String(profile.collaborationCount),
    },
  ];

  return (
    <View style={styles.root}>
      <Card style={styles.caseCard} tone="elevated">
        <View style={styles.identity}>
          <View style={[styles.avatarWell, surfaceStyle(palette, 'default').container]}>
            <Avatar name={profile.name} size={72} uri={profile.photoUrl} />
          </View>
          <View style={styles.identityCopy}>
            <View style={styles.nameRow}>
              <AppText numberOfLines={2} style={styles.name} variant="title2">
                {profile.name}
              </AppText>
              {profile.isPremium ? <VerifiedBadge /> : null}
            </View>
            <AppText color={palette.bronze} variant="mono">
              {profileHandle(profile.name)}
            </AppText>
            <AppText color={palette.muted} numberOfLines={2} variant="caption">
              {[
                profile.age ? formatSwiftPlaceholders(t('%lld ans'), profile.age) : null,
                [
                  profile.neighborhood || profile.city,
                  profile.country ? `(${profile.country})` : null,
                ]
                  .filter(Boolean)
                  .join(' '),
              ]
                .filter(Boolean)
                .join(' · ') || t('Lieu non renseigné')}
            </AppText>
          </View>
        </View>
        <View style={styles.chips}>
          {profile.instruments.map((instrument) => (
            <Tag
              key={instrument}
              label={`${t(instrument)} · ${t(
                shortProfileLevel(profile.instrumentLevels[instrument] ?? profile.level),
              )}`}
            />
          ))}
          {!profile.instruments.length ? (
            <DispoButton icon="add" onPress={edit} size="compact" variant="ghost">
              {t('Ajouter un instrument')}
            </DispoButton>
          ) : null}
        </View>
        <ProfileStatsCard stats={stats} />
      </Card>

      <ProfileCollaboratorsCard profileId={profile.id} name={firstName} />

      {profile.bio.trim() ? (
        <AppText variant="subheadline">
          {profile.bio.split(/(@[\p{L}\p{N}_.]+)/gu).map((part, index) => (
            <AppText
              color={part.startsWith('@') ? palette.electric : palette.text}
              key={index}
              variant="subheadline"
            >
              {part}
            </AppText>
          ))}
        </AppText>
      ) : (
        <Pressable accessibilityRole="button" onPress={edit} style={styles.emptyBio}>
          <AppText color={palette.muted} variant="subheadline">
            {t('Ajoute une phrase sur ce que tu joues')}
          </AppText>
        </Pressable>
      )}

      <View style={styles.actions}>
        <View style={styles.actionMain}>
          <DispoButton icon="create-outline" onPress={edit}>
            {t('Modifier mon profil')}
          </DispoButton>
        </View>
        <IconButton accessibilityLabel={t('Aperçu')} icon="eye-outline" onPress={preview} />
      </View>

      {schools.isSuccess && completion.percent < 100 ? (
        <Card style={styles.completion} tone="inset">
          <View style={styles.completionHeading}>
            <AppText style={styles.completionTitle} variant="headline">
              {t('Profil complété à {{percent}}%', { percent: completion.percent })}
            </AppText>
            <AppText color={palette.muted} variant="caption">
              {t('profile.steps', { count: completion.missing.length })}
            </AppText>
          </View>
          <View
            accessibilityLabel={t('Complétion du profil')}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: 100, min: 0, now: completion.percent }}
            style={[styles.progressTrack, { backgroundColor: palette.border }]}
          >
            <View
              style={[
                styles.progressFill,
                { backgroundColor: palette.electric, width: `${completion.percent}%` },
              ]}
            />
          </View>
          <View style={styles.completionActions}>
            {completion.missing.slice(0, 2).map((step) => (
              <DispoButton
                icon="add"
                key={step.id}
                onPress={() => router.push(step.route as never)}
                size="compact"
                variant="secondary"
              >
                {t(step.label)}
              </DispoButton>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={styles.section}>
        <SectionHeader action={{ label: t('Modifier'), onPress: edit }} title={t('Mes genres')} />
        <View style={styles.chips}>
          {profile.genres.map((genre) => (
            <Tag color={palette.bronze} key={genre} label={t(genre)} />
          ))}
          {!profile.genres.length ? (
            <AppText color={palette.muted} variant="caption">
              {t('Ajoute tes genres pour être trouvé sur les bons SOS.')}
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader action={{ label: t('Tout voir'), onPress: demos }} title={t('Mes démos')} />
        <FlatList
          contentContainerStyle={styles.carouselContent}
          data={videos}
          decelerationRate="fast"
          horizontal
          keyExtractor={(video) => video.id}
          ListHeaderComponent={
            <Pressable
              accessibilityRole="button"
              onPress={addDemo}
              style={({ pressed }) => [
                styles.videoTile,
                styles.addVideo,
                {
                  backgroundColor: tint(palette.electric, 0.06),
                  borderColor: tint(palette.electric, 0.4),
                },
                pressed && pressedStyle,
              ]}
            >
              <Ionicons color={palette.electric} name="add" size={25} />
              <AppText
                color={palette.electric}
                style={styles.addVideoLabel}
                variant="caption"
                weight="semibold"
              >
                {t('Ajouter une vidéo')}
              </AppText>
            </Pressable>
          }
          renderItem={({ item: video, index }) => {
            const title = video.title || formatSwiftPlaceholders(t('Vidéo %lld'), index + 1);
            return (
              <Pressable
                accessibilityLabel={`${t('Lire')} · ${title}`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    params: { id: profile.id, title, url: video.url },
                    pathname: '/profiles/[id]/video',
                  } as never)
                }
                style={({ pressed }) => [
                  styles.videoTile,
                  insetStyle(palette),
                  pressed && pressedStyle,
                ]}
              >
                {video.thumbUrl ? (
                  <Image
                    contentFit="cover"
                    source={{ uri: video.thumbUrl }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <Ionicons color={palette.muted} name="videocam-outline" size={28} />
                )}
                <GrainOverlay />
                <View style={styles.playBadge}>
                  <Ionicons color={onAccent} name="play" size={12} />
                </View>
                <View style={styles.videoCaption}>
                  <AppText color={onAccent} numberOfLines={2} variant="caption2" weight="semibold">
                    {title}
                  </AppText>
                  {video.date ? (
                    <AppText color={onAccent} variant="caption2">
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
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={demoTileWidth + spacing.xs}
          style={styles.carousel}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('Écoles & affiliations')} />
        <Card padding={spacing.xs}>
          {schools.isLoading ? (
            <LoadingState />
          ) : schools.isError ? (
            <ErrorState message={schools.error.message} onRetry={() => void schools.refetch()} />
          ) : (
            affiliations.map((affiliation) => {
              const verified = affiliation.verificationLevel === 'verified';
              return (
                <ListRow
                  accessibilityLabel={`${affiliation.school.name} — ${t('Modifier mon affiliation')}`}
                  accessory={
                    <View style={styles.schoolAccessory}>
                      <Tag
                        color={verified ? palette.jam : palette.signal}
                        label={t(verified ? 'Vérifié' : 'À vérifier')}
                      />
                      <Ionicons color={palette.muted} name="chevron-forward" size={18} />
                    </View>
                  }
                  key={affiliation.id}
                  leading={<SchoolAvatar school={affiliation.school} size={40} />}
                  onPress={() => router.push(`/schools/${affiliation.school.id}/join` as never)}
                  subtitle={affiliation.roleLabel || t(schoolRoleLabel(affiliation.role))}
                  title={affiliation.school.name}
                  tone="plain"
                />
              );
            })
          )}
          <ListRow
            leadingIcon="add"
            leadingIconColor={palette.muted}
            onPress={() => router.push('/schools' as never)}
            title={t('Ajouter une école ou un collectif')}
            tone="plain"
          />
        </Card>
      </View>

      <View style={styles.section}>
        {socialLinks.length ? <SectionHeader title={t('Liens')} /> : null}
        <ProfileSocialLinks addLabel={t('Ajouter un lien')} links={socialLinks} onAdd={edit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionMain: { flex: 1 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  // Tuile d'ajout : contour pointillé, la seule bordure dessinée par l'écran.
  addVideo: { borderStyle: 'dashed', borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  // Anneau relevé autour de la photo : la surface `default` posée dans l'étui `elevated`.
  avatarWell: { borderRadius: radii.round, padding: spacing.xxs },
  caseCard: { gap: spacing.sm },
  addVideoLabel: { textAlign: 'center' },
  carousel: { marginHorizontal: -spacing.gutter },
  carouselContent: { gap: spacing.xs, paddingHorizontal: spacing.gutter },
  chips: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  completion: { gap: spacing.sm },
  completionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  completionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
    justifyContent: 'space-between',
  },
  completionTitle: { flexShrink: 1 },
  emptyBio: { justifyContent: 'center', minHeight: minimumTouchTarget },
  identity: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  identityCopy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  name: { flexShrink: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  playBadge: {
    alignItems: 'center',
    backgroundColor: scrimColor,
    borderRadius: radii.round,
    height: 26,
    justifyContent: 'center',
    left: spacing.xs,
    position: 'absolute',
    top: spacing.xs,
    width: 26,
  },
  progressFill: { borderRadius: radii.round, height: 6 },
  progressTrack: { borderRadius: radii.round, height: 6, overflow: 'hidden' },
  root: { gap: spacing.md },
  schoolAccessory: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  section: { gap: spacing.xs },
  videoCaption: {
    backgroundColor: scrimColor,
    bottom: 0,
    gap: spacing.xxs,
    left: 0,
    padding: spacing.xs,
    position: 'absolute',
    right: 0,
  },
  videoTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 150,
    justifyContent: 'center',
    overflow: 'hidden',
    width: demoTileWidth,
  },
});
