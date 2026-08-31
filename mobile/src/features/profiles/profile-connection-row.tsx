import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import type { ProfileConnection } from '@/features/profiles/profile-social-model';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function ProfileConnectionRow({ profile }: { profile: ProfileConnection }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/profiles/${profile.id}`)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={11}>
        <View style={styles.row}>
          <Avatar name={profile.name} size={44} uri={profile.photoUrl} />
          <View style={styles.text}>
            <View style={styles.nameRow}>
              <AppText numberOfLines={1} style={styles.name} variant="subheadline">
                {profile.name}
              </AppText>
              {profile.isDemo ? <Tag color={palette.bronze} label={t('Démo')} /> : null}
            </View>
            <AppText color={palette.muted} numberOfLines={1} variant="caption2">
              {profile.instruments
                .slice(0, 2)
                .map((instrument) => t(instrument))
                .join(' · ') || t(profile.level)}
            </AppText>
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={15} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  name: { flexShrink: 1, fontWeight: '800' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  text: { flex: 1, gap: 2 },
});
