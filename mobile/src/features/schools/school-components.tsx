import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { TFunction } from 'i18next';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  schoolDisplayName,
  schoolInitials,
  schoolRoleLabel,
  type MusicSchool,
  type SchoolAffiliation,
  type SchoolMember,
} from './school-model';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, typography } from '@/theme/tokens';

type AffiliationIdentity = Pick<
  SchoolAffiliation | SchoolMember,
  'role' | 'roleLabel' | 'verificationLevel'
>;

function localizedAffiliationStatus(affiliation: AffiliationIdentity, t: TFunction): string {
  const role = affiliation.roleLabel?.trim() || t(schoolRoleLabel(affiliation.role));
  return affiliation.verificationLevel === 'verified' ? role : `${role} · ${t('déclaré')}`;
}

export function SchoolAvatar({ school, size = 44 }: { school: MusicSchool; size?: number }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const radius = size * 0.27;
  return (
    <View
      style={[
        styles.schoolAvatar,
        { backgroundColor: palette.inset, borderRadius: radius, height: size, width: size },
      ]}
    >
      {school.logoUrl ? (
        <Image
          accessibilityLabel={formatSwiftPlaceholders(t('Logo %@'), school.name)}
          contentFit="contain"
          source={{ uri: school.logoUrl }}
          style={{ height: size * 0.72, width: size * 0.72 }}
        />
      ) : (
        <AppText
          color={palette.bronze}
          style={[styles.initials, { fontSize: Math.max(9, size * 0.24) }]}
        >
          {schoolInitials(school)}
        </AppText>
      )}
    </View>
  );
}

export function VerifiedSchoolSeal({ compact = false }: { compact?: boolean }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (compact) {
    return (
      <Ionicons
        accessibilityLabel={t('École vérifiée')}
        color={palette.jam}
        name="checkmark-circle"
        size={14}
      />
    );
  }
  return (
    <View style={[styles.verifiedPill, { backgroundColor: `${palette.jam}18` }]}>
      <Ionicons color={palette.jam} name="checkmark-circle" size={14} />
      <AppText color={palette.jam} style={styles.verifiedText} variant="caption">
        {t('École vérifiée')}
      </AppText>
    </View>
  );
}

export function SchoolDirectoryCard({
  affiliation,
  onPress,
  school,
}: {
  affiliation: SchoolAffiliation | null;
  onPress: () => void;
  school: MusicSchool;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const joined = affiliation?.status === 'active';
  return (
    <Pressable
      accessibilityLabel={`${school.name}, ${t(joined ? 'Membre, ouvrir' : 'Ajouter cette école')}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={13}>
        <View style={styles.directoryRow}>
          <SchoolAvatar school={school} size={48} />
          <View style={styles.directoryCopy}>
            <View style={styles.schoolTitleRow}>
              <AppText numberOfLines={2} style={styles.directoryTitle} variant="subheadline">
                {school.name}
              </AppText>
              {school.isVerified ? <VerifiedSchoolSeal compact /> : null}
            </View>
            <AppText color={palette.muted} variant="caption">
              {school.city} · {school.countryCode.toLocaleUpperCase()}
            </AppText>
            {joined ? (
              <AppText color={palette.bronze} variant="caption2">
                {localizedAffiliationStatus(affiliation, t)}
              </AppText>
            ) : null}
          </View>
          <Ionicons
            color={joined ? palette.jam : palette.bronze}
            name={joined ? 'checkmark-circle' : 'add-circle'}
            size={23}
          />
        </View>
      </Card>
    </Pressable>
  );
}

export function AffiliationStatusCard({ affiliation }: { affiliation: SchoolAffiliation }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Card style={styles.statusCard}>
      <View style={styles.statusHeader}>
        <View style={[styles.statusIcon, { backgroundColor: `${palette.bronze}18` }]}>
          <Ionicons color={palette.bronze} name="person-circle" size={20} />
        </View>
        <View style={styles.statusCopy}>
          <AppText style={styles.statusTitle} variant="subheadline">
            {t('Mon affiliation')}
          </AppText>
          <AppText color={palette.muted} variant="caption">
            {localizedAffiliationStatus(affiliation, t)}
          </AppText>
        </View>
        {affiliation.verificationLevel === 'verified' ? (
          <Tag color={palette.jam} label={t('Rôle vérifié')} />
        ) : (
          <Tag color={palette.bronze} label={t('Déclaré')} />
        )}
      </View>
      <View style={[styles.statusDivider, { backgroundColor: palette.border }]} />
      <View style={styles.metaRows}>
        <StatusRow
          icon="eye-outline"
          label={t('Visibilité')}
          value={
            affiliation.visibility === 'profile'
              ? t('Sur mon profil')
              : affiliation.visibility === 'school_only'
                ? t("Membres de l'école")
                : t('Moi uniquement')
          }
        />
        {affiliation.isPrimary ? (
          <StatusRow icon="star" label={t('Profil')} value={t('École principale')} />
        ) : null}
        <StatusRow
          icon="people-outline"
          label={t('Annuaire')}
          value={formatSwiftPlaceholders(t('%lld membres'), affiliation.memberCount)}
        />
      </View>
      <View style={[styles.notice, { backgroundColor: `${palette.bronze}14` }]}>
        <Ionicons color={palette.bronze} name="information-circle" size={16} />
        <AppText color={palette.muted} style={styles.noticeText} variant="caption">
          {affiliation.verificationLevel === 'verified'
            ? t("Ce rôle a été validé par l'établissement.")
            : t("Ton rôle est déclaré par toi jusqu'à validation par l'établissement.")}
        </AppText>
      </View>
    </Card>
  );
}

function StatusRow({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.metaRow}>
      <Ionicons color={palette.bronze} name={icon} size={15} />
      <AppText color={palette.muted} style={styles.metaLabel} variant="caption">
        {label}
      </AppText>
      <AppText style={styles.metaValue} variant="caption">
        {value}
      </AppText>
    </View>
  );
}

export function SchoolMemberCard({
  member,
  onPress,
}: {
  member: SchoolMember;
  onPress?: () => void;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const content = (
    <Card padding={11}>
      <View style={styles.memberRow}>
        <Avatar name={member.name} size={42} uri={member.photoUrl} />
        <View style={styles.memberCopy}>
          <AppText numberOfLines={1} style={styles.memberName} variant="subheadline">
            {member.name}
          </AppText>
          <View style={styles.memberStatus}>
            <AppText color={palette.muted} variant="caption2">
              {localizedAffiliationStatus(member, t)}
            </AppText>
            {member.verificationLevel === 'verified' ? (
              <Ionicons color={palette.jam} name="checkmark-circle" size={13} />
            ) : null}
          </View>
          {member.instruments.length > 0 ? (
            <AppText color={palette.bronze} numberOfLines={1} variant="caption2">
              {member.instruments.map((instrument) => t(instrument)).join(' · ')}
            </AppText>
          ) : null}
        </View>
        {onPress ? <Ionicons color={palette.muted} name="chevron-forward" size={15} /> : null}
      </View>
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

export function SchoolAffiliationChip({ affiliation }: { affiliation: SchoolAffiliation }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={`${affiliation.school.name}, ${localizedAffiliationStatus(affiliation, t)}`}
      style={[
        styles.affiliationChip,
        { backgroundColor: `${palette.bronze}20`, borderColor: `${palette.bronze}66` },
      ]}
    >
      <Ionicons color={palette.bronze} name="business" size={10} />
      <AppText color={palette.bronze} numberOfLines={1} style={styles.chipText} variant="caption">
        {schoolDisplayName(affiliation.school)} · {localizedAffiliationStatus(affiliation, t)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  affiliationChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.chip,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    maxWidth: 260,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chipText: { fontWeight: '700' },
  directoryCopy: { flex: 1, gap: 3 },
  directoryRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  directoryTitle: { flexShrink: 1, fontWeight: '700' },
  initials: { fontFamily: typography.monoSemibold, fontWeight: '800' },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { fontWeight: '700' },
  memberRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  memberStatus: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  metaLabel: { flex: 1 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  metaRows: { gap: spacing.xs },
  metaValue: { fontWeight: '700' },
  notice: {
    alignItems: 'flex-start',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  noticeText: { flex: 1 },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  schoolAvatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  schoolTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  statusCard: { gap: spacing.sm },
  statusCopy: { flex: 1, gap: 2 },
  statusDivider: { height: StyleSheet.hairlineWidth },
  statusHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  statusIcon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  statusTitle: { fontWeight: '800' },
  verifiedPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.chip,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: spacing.control,
    paddingVertical: spacing.tight,
  },
  verifiedText: { fontWeight: '800' },
});
