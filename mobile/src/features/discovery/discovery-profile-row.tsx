import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import { relationTags, type ProfileSummary } from '@/domain/profile';
import { profilePlaceLabel } from '@/features/discovery/discovery-model';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function handleFor(name: string): string {
  return `@${name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')}`;
}

export function DiscoveryProfileRow({
  neededDate,
  profile,
}: {
  neededDate?: string | null;
  profile: ProfileSummary;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={formatSwiftPlaceholders(t('Ouvrir le profil de %@'), profile.name)}
      accessibilityRole="button"
      onPress={() => router.push(`/profiles/${profile.id}`)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={spacing.sm}>
        <View style={styles.row}>
          <Avatar name={profile.name} size={48} uri={profile.photoUrl} />
          <View style={styles.copy}>
            <View style={styles.nameRow}>
              <AppText numberOfLines={1} style={styles.name} variant="subheadline">
                {profile.name}
              </AppText>
              {profile.isPremium ? (
                <Ionicons color={palette.electric} name="sparkles" size={13} />
              ) : null}
            </View>
            <AppText color={palette.bronze} style={styles.handle} variant="caption2">
              {handleFor(profile.name)}
            </AppText>
            <View style={styles.tags}>
              {profile.instruments.slice(0, 4).map((instrument) => (
                <Tag
                  color={palette.electric}
                  key={instrument}
                  label={`${t(instrument)} · ${t(
                    profile.instrumentLevels[instrument] ?? profile.level,
                  )}`}
                />
              ))}
              {profile.instruments.length > 4 ? (
                <Tag color={palette.bronze} label={`+${profile.instruments.length - 4}`} />
              ) : null}
            </View>
            {profile.schools.length > 0 ? (
              <View style={styles.tags}>
                {profile.schools.slice(0, 3).map((school) => (
                  <Tag
                    color={palette.bronze}
                    key={school.id}
                    label={school.shortName || school.name}
                  />
                ))}
              </View>
            ) : null}
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {profilePlaceLabel(profile, neededDate) || t('Lieu non renseigné')}
            </AppText>
            <View style={styles.footer}>
              <AppText color={palette.muted} variant="caption2">
                {formatSwiftPlaceholders(t('%lld abonnés'), profile.followerCount)}
              </AppText>
              {relationTags(profile).map((label) => (
                <Tag
                  color={label === 'Ami' ? palette.jam : palette.bronze}
                  key={label}
                  label={t(label)}
                />
              ))}
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: spacing.compact },
  footer: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.tight },
  handle: { fontWeight: '700' },
  name: { flex: 1, fontWeight: '800' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.compact },
});
