import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/avatar';
import { ListRow } from '@/components/ui/list-row';
import { Tag } from '@/components/ui/tag';
import { shortProfileLevel } from '@/domain/profile';
import type { ProfileConnection } from '@/features/profiles/profile-social-model';
import { useDispoTheme } from '@/theme/theme-context';

export function ProfileConnectionRow({ profile }: { profile: ProfileConnection }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const subtitle =
    profile.instruments
      .slice(0, 2)
      .map((instrument) => t(instrument))
      .join(' · ') || t(shortProfileLevel(profile.level));
  return (
    <ListRow
      accessibilityLabel={[profile.name, profile.isDemo ? t('Démo') : null, subtitle]
        .filter(Boolean)
        .join(', ')}
      accessory={profile.isDemo ? <Tag color={palette.bronze} label={t('Démo')} /> : undefined}
      leading={<Avatar name={profile.name} size={44} uri={profile.photoUrl} />}
      onPress={() => router.push(`/profiles/${profile.id}`)}
      subtitle={subtitle}
      title={profile.name}
    />
  );
}
