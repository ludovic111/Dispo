import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { CompactProfileCard } from './compact-profile-card';

import { AppText } from '@/components/ui/app-text';
import {
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
  return <CompactProfileCard onPress={onPress} profile={profile} />;
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
