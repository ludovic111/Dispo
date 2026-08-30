import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SchoolBadge } from './profile-card';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import { relationTags, type ProfileSummary } from '@/domain/profile';
import { useAuth } from '@/features/auth/auth-context';
import { ensureDirectConversation } from '@/features/messages/message-repository';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function ProfileDetail({
  profile,
  self = false,
}: {
  profile: ProfileSummary;
  self?: boolean;
}) {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const conversation = useMutation({
    mutationFn: () => ensureDirectConversation(session?.user.id ?? '', profile.id),
    onSuccess: (id) => router.push(`/messages/${id}?name=${encodeURIComponent(profile.name)}`),
  });

  return (
    <View style={styles.root}>
      <Card style={styles.hero}>
        <Avatar name={profile.name} size={104} uri={profile.photoUrl} />
        <View style={styles.center}>
          <View style={styles.nameRow}>
            <AppText style={styles.name} variant="display">
              {profile.name}
            </AppText>
            {profile.isPremium ? (
              <Ionicons color={palette.electric} name="sparkles" size={18} />
            ) : null}
          </View>
          <AppText color={palette.electric} style={styles.instrument}>
            {profile.instruments.join(' · ') || 'Musicien'}
          </AppText>
          <AppText color={palette.muted}>
            {[profile.city, profile.country].filter(Boolean).join(', ') || 'Lieu non renseigné'}
          </AppText>
          <View style={styles.tags}>
            {relationTags(profile).map((tag) => (
              <Tag key={tag} label={tag} />
            ))}
            <Tag color={palette.bronze} label={profile.level} />
          </View>
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText color={palette.bronze} variant="label">
          À propos
        </AppText>
        <AppText>{profile.bio || 'Ce musicien n’a pas encore ajouté de bio.'}</AppText>
        <View style={styles.tags}>
          {profile.genres.map((genre) => (
            <Tag color={palette.bronze} key={genre} label={genre} />
          ))}
        </View>
      </Card>

      {profile.schools.length > 0 ? (
        <Card style={styles.section}>
          <AppText color={palette.bronze} variant="label">
            Écoles
          </AppText>
          {profile.schools.map((school) => (
            <SchoolBadge key={school.id} school={school} />
          ))}
        </Card>
      ) : null}

      <Card style={styles.stats}>
        <View style={styles.stat}>
          <AppText style={styles.statValue}>{profile.ratingAverage?.toFixed(1) ?? '—'}</AppText>
          <AppText color={palette.muted} variant="caption">
            Note
          </AppText>
        </View>
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <View style={styles.stat}>
          <AppText style={styles.statValue}>{profile.ratingCount}</AppText>
          <AppText color={palette.muted} variant="caption">
            Avis
          </AppText>
        </View>
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <View style={styles.stat}>
          <AppText style={styles.statValue}>{profile.availableDates.length}</AppText>
          <AppText color={palette.muted} variant="caption">
            Dispos
          </AppText>
        </View>
      </Card>

      {!self ? (
        <>
          {conversation.error ? (
            <AppText color={palette.error}>{conversation.error.message}</AppText>
          ) : null}
          <DispoButton
            icon="chatbubble-ellipses-outline"
            loading={conversation.isPending}
            onPress={() => conversation.mutate()}
          >
            Contacter
          </DispoButton>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 5 },
  divider: { height: 34, width: 1 },
  hero: { alignItems: 'center', gap: spacing.md },
  instrument: { fontWeight: '800' },
  name: { fontSize: 27, textAlign: 'center' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  root: { gap: spacing.md },
  section: { gap: spacing.sm },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
  stats: { alignItems: 'center', flexDirection: 'row' },
  statValue: { fontFamily: 'SplineSansMonoSemibold', fontSize: 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
});
