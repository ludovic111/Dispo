import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import {
  relationTags,
  schoolLogoPresentation,
  type ProfileSummary,
  type SchoolAffiliation,
} from '@/domain/profile';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function ProfileCard({
  onPress,
  profile,
}: {
  onPress: () => void;
  profile: ProfileSummary;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={12}>
        <View style={styles.row}>
          <Avatar name={profile.name} size={64} uri={profile.photoUrl} />
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <AppText numberOfLines={1} style={styles.name} variant="title">
                {profile.name}
              </AppText>
              {profile.isPremium ? (
                <Ionicons color={palette.electric} name="sparkles" size={15} />
              ) : null}
            </View>
            <AppText color={palette.electric} numberOfLines={1} style={styles.instrument}>
              {profile.instruments.join(' · ') || 'Musicien'}
            </AppText>
            <View style={styles.tags}>
              {relationTags(profile).map((tag) => (
                <Tag key={tag} label={tag} />
              ))}
              {profile.genres.slice(0, 2).map((genre) => (
                <Tag color={palette.bronze} key={genre} label={genre} />
              ))}
            </View>
            <View style={styles.meta}>
              <Ionicons color={palette.muted} name="location-outline" size={13} />
              <AppText color={palette.muted} numberOfLines={1} variant="caption">
                {[profile.city, profile.country].filter(Boolean).join(', ') || 'Lieu non renseigné'}
              </AppText>
            </View>
          </View>
          <Ionicons color={palette.bronze} name="chevron-forward" size={18} />
        </View>
      </Card>
    </Pressable>
  );
}

export function SchoolBadge({ school }: { school: SchoolAffiliation }) {
  const { palette } = useDispoTheme();
  const logo = schoolLogoPresentation(school);
  return (
    <View style={[styles.school, { backgroundColor: palette.inset, borderColor: palette.border }]}>
      {logo.kind === 'image' ? (
        <Image contentFit="contain" source={{ uri: logo.uri }} style={styles.schoolLogo} />
      ) : (
        <View style={[styles.schoolLogo, styles.schoolFallback, { backgroundColor: palette.card }]}>
          <AppText color={palette.electric} style={styles.schoolInitials}>
            {logo.initials}
          </AppText>
        </View>
      )}
      <AppText numberOfLines={1} style={styles.schoolName}>
        {school.shortName || school.name}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 4 },
  instrument: { fontSize: 12, fontWeight: '800' },
  meta: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  name: { flexShrink: 1 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  school: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  schoolFallback: { alignItems: 'center', justifyContent: 'center' },
  schoolInitials: { fontSize: 10, fontWeight: '900' },
  schoolLogo: { borderRadius: 8, height: 34, width: 34 },
  schoolName: { flex: 1, fontSize: 13, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
});
