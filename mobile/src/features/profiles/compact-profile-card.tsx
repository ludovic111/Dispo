import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import {
  schoolAcronym,
  shortProfileLevel,
  type ProfileSummary,
  type SchoolAffiliation,
} from '@/domain/profile';
import { profileDistanceLabel } from '@/features/discovery/discovery-model';
import { useDispoTheme } from '@/theme/theme-context';

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
  const { fontScale } = useWindowDimensions();
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
      accessibilityRole="button"
      accessibilityLabel={[
        profile.name,
        school?.name,
        accessibleInstruments,
        place,
        relation && t(relation),
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card
        padding={12}
        style={{ height: 32 + 60 * Math.max(1, fontScale), justifyContent: 'center' }}
      >
        <View style={styles.row}>
          <Avatar name={profile.name} size={48} uri={profile.photoUrl} />
          <View style={styles.copy}>
            <View style={styles.nameRow}>
              <AppText numberOfLines={1} style={styles.name} variant="headline">
                {profile.name}
              </AppText>
              {school ? (
                <AppText
                  color={palette.muted}
                  numberOfLines={1}
                  style={[styles.school, { backgroundColor: palette.inset }]}
                  variant="caption"
                >
                  {schoolAcronym(school)}
                </AppText>
              ) : null}
            </View>
            <AppText color={palette.bronze} numberOfLines={1} variant="subheadline">
              {instruments}
            </AppText>
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {place}
            </AppText>
          </View>
          {relation ? (
            <AppText
              color={relation === 'Ami' ? palette.jam : palette.muted}
              numberOfLines={1}
              style={[
                styles.relation,
                { backgroundColor: relation === 'Ami' ? `${palette.jam}18` : palette.inset },
              ]}
              variant="caption"
            >
              {t(relation)}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  name: { flexShrink: 1 },
  school: {
    flexShrink: 0,
    maxWidth: 58,
    borderRadius: 7,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  relation: {
    flexShrink: 0,
    maxWidth: 76,
    fontWeight: '700',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  pressed: { opacity: 0.75 },
});
