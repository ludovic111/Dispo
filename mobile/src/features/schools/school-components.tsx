import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { TFunction } from 'i18next';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
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
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { shortProfileLevel } from '@/domain/profile';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { insetStyle, pressedStyle, radii, spacing, tint } from '@/theme/tokens';

type AffiliationIdentity = Pick<
  SchoolAffiliation | SchoolMember,
  'role' | 'roleLabel' | 'verificationLevel'
>;

function localizedAffiliationStatus(affiliation: AffiliationIdentity, t: TFunction): string {
  const role = affiliation.roleLabel?.trim() || t(schoolRoleLabel(affiliation.role));
  return affiliation.verificationLevel === 'verified' ? role : `${role} · ${t('déclaré')}`;
}

/** Logo d'école en « squircle » : la signature visuelle des établissements. */
export function SchoolAvatar({ school, size = 44 }: { school: MusicSchool; size?: number }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const radius = size * 0.27;
  return (
    <View
      style={[
        styles.schoolAvatar,
        insetStyle(palette),
        { borderRadius: radius, height: size, width: size },
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
        <AppText color={palette.bronze} numberOfLines={1} variant={size >= 56 ? 'mono' : 'label'}>
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
  return <Tag color={palette.jam} icon="checkmark-circle" label={t('École vérifiée')} />;
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
      style={({ pressed }) => pressed && pressedStyle}
    >
      <Card padding={spacing.sm}>
        <View style={styles.row}>
          <SchoolAvatar school={school} size={48} />
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <AppText numberOfLines={2} style={styles.title} variant="headline">
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
      <View style={styles.row}>
        <View style={[styles.statusIcon, { backgroundColor: tint(palette.bronze, 0.09) }]}>
          <Ionicons color={palette.bronze} name="person-circle" size={20} />
        </View>
        <View style={styles.copy}>
          <AppText variant="headline">{t('Mon affiliation')}</AppText>
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
      <View style={[styles.notice, { backgroundColor: tint(palette.bronze, 0.08) }]}>
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
      <AppText variant="caption" weight="semibold">
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
  const level = t(shortProfileLevel(member.level));
  const instruments = member.instruments.map((instrument) => t(instrument)).join(' · ');
  const content = (
    <Card padding={spacing.sm}>
      <View style={styles.row}>
        <Avatar name={member.name} size={42} uri={member.photoUrl} />
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <AppText numberOfLines={2} style={styles.title} variant="headline">
              {member.name}
            </AppText>
            {member.isPremium ? <VerifiedBadge size="sm" /> : null}
          </View>
          <View style={styles.memberStatus}>
            <AppText color={palette.muted} variant="caption2">
              {localizedAffiliationStatus(member, t)}
            </AppText>
            {member.verificationLevel === 'verified' ? (
              <Ionicons color={palette.jam} name="checkmark-circle" size={13} />
            ) : null}
          </View>
          <AppText color={palette.bronze} numberOfLines={1} variant="caption">
            {instruments ? `${instruments} · ${level}` : level}
          </AppText>
        </View>
        {onPress ? <Ionicons color={palette.muted} name="chevron-forward" size={15} /> : null}
      </View>
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityLabel={[
        member.name,
        member.isPremium ? t('Membre Premium') : null,
        localizedAffiliationStatus(member, t),
        instruments ? `${instruments} · ${level}` : level,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  memberStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  metaLabel: { flex: 1 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  metaRows: { gap: spacing.xs },
  notice: {
    alignItems: 'flex-start',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  noticeText: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  schoolAvatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  statusCard: { gap: spacing.sm },
  statusDivider: { height: StyleSheet.hairlineWidth },
  statusIcon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  title: { flexShrink: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
});
