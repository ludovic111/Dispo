import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { ListRow } from '@/components/ui/list-row';
import { Tag } from '@/components/ui/tag';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { shortProfileLevel } from '@/domain/profile';
import type { ProfileConnection } from '@/features/profiles/profile-social-model';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

/** Ligne d'abonné ou de collaborateur : avatar, nom, instruments · niveau, coche Premium. */
export function ProfileConnectionRow({ profile }: { profile: ProfileConnection }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const level = t(shortProfileLevel(profile.level));
  const instruments = profile.instruments
    .slice(0, 2)
    .map((instrument) => t(instrument))
    .join(' · ');
  const subtitle = instruments ? `${instruments} · ${level}` : level;
  const showAccessory = profile.isPremium || profile.isDemo;
  return (
    <ListRow
      accessibilityLabel={[
        profile.name,
        profile.isPremium ? t('Membre Premium') : null,
        profile.isDemo ? t('Démo') : null,
        subtitle,
      ]
        .filter(Boolean)
        .join(', ')}
      accessory={
        showAccessory ? (
          <View style={styles.accessory}>
            {profile.isPremium ? <VerifiedBadge size="sm" /> : null}
            {profile.isDemo ? <Tag color={palette.bronze} label={t('Démo')} /> : null}
            <Ionicons color={palette.muted} name="chevron-forward" size={18} />
          </View>
        ) : undefined
      }
      leading={<Avatar name={profile.name} size={44} uri={profile.photoUrl} />}
      onPress={() => router.push(`/profiles/${profile.id}`)}
      subtitle={subtitle}
      title={profile.name}
      titleLines={2}
    />
  );
}

const styles = StyleSheet.create({
  accessory: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
