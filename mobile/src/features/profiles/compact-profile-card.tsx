import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import {
  schoolAcronym,
  shortProfileLevel,
  type ProfileSummary,
  type SchoolAffiliation,
} from '@/domain/profile';
import { profileDistanceLabel } from '@/features/discovery/discovery-model';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

export function CompactProfileCard({
  profile,
  onPress,
  primarySchool,
  referenceProfile,
}: {
  profile: ProfileSummary;
  onPress: () => void;
  primarySchool?: SchoolAffiliation | null | undefined;
  referenceProfile?: ProfileSummary | null | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const school = primarySchool === undefined ? profile.schools[0] : primarySchool;
  const relation =
    profile.isFriend || profile.relationship === 'friend'
      ? 'Ami'
      : profile.relationship === 'following'
        ? 'Suivi'
        : profile.relationship === 'follower'
          ? 'Te suit'
          : null;
  const instruments =
    profile.instruments
      .map(
        (instrument) =>
          `${t(instrument)} · ${t(shortProfileLevel(profile.instrumentLevels[instrument] ?? profile.level, true))}`,
      )
      .join(' · ') || `${t('Musicien')} · ${t(shortProfileLevel(profile.level, true))}`;
  const accessibleInstruments =
    profile.instruments
      .map(
        (instrument) =>
          `${t(instrument)} · ${t(profile.instrumentLevels[instrument] ?? profile.level)}`,
      )
      .join(', ') || `${t('Musicien')} · ${t(profile.level)}`;
  const distance = referenceProfile
    ? profileDistanceLabel(referenceProfile, profile, i18n.resolvedLanguage ?? 'fr-CH')
    : null;
  const place = [profile.city || t('Lieu non renseigné'), distance].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityLabel={[
        profile.name,
        profile.isPremium ? t('Membre Premium') : null,
        school?.name,
        accessibleInstruments,
        place,
        relation && t(relation),
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <Card padding={spacing.sm}>
        <View style={styles.row}>
          <Avatar name={profile.name} size={48} uri={profile.photoUrl} />
          <View style={styles.copy}>
            <View style={styles.nameRow}>
              <AppText numberOfLines={2} style={styles.name} variant="headline">
                {profile.name}
              </AppText>
              {profile.isPremium ? <VerifiedBadge size="sm" /> : null}
              {school ? <Tag color={palette.bronze} label={schoolAcronym(school)} /> : null}
            </View>
            <AppText color={palette.bronze} numberOfLines={1} variant="subheadline">
              {instruments}
            </AppText>
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {place}
            </AppText>
          </View>
          {relation ? (
            <Tag color={relation === 'Ami' ? palette.jam : palette.muted} label={t(relation)} />
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  name: { flexShrink: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
