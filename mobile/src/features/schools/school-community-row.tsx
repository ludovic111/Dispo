import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { SchoolAvatar, VerifiedSchoolSeal } from './school-components';
import { affiliationRoleLabel, latestSchoolMessage, type SchoolCommunity } from './school-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { relativeMessageDate } from '@/features/messages/message-model';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, radii, spacing, typography } from '@/theme/tokens';

export function SchoolCommunityRow({
  community,
  onPress,
  unread,
}: {
  community: SchoolCommunity;
  onPress: () => void;
  unread: number;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const school = community.affiliation.school;
  const last = latestSchoolMessage(community.messages);
  const preview = last?.deletedAt
    ? t('Message supprimé')
    : last?.text || t('Présente-toi à la communauté');
  const role = community.affiliation.roleLabel?.trim()
    ? affiliationRoleLabel(community.affiliation)
    : t(affiliationRoleLabel(community.affiliation));
  const memberLine = `${formatSwiftPlaceholders(
    t('%lld membres'),
    community.affiliation.memberCount,
  )} · ${role}`;
  const hasUnread = unread > 0;
  return (
    <Pressable
      accessibilityHint={t('Ouvrir la communauté')}
      accessibilityLabel={`${school.name}, ${memberLine}${
        hasUnread ? `, ${unread} ${t('messages non lus')}` : ''
      }`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={13}>
        <View style={styles.row}>
          <SchoolAvatar school={school} size={48} />
          <View style={styles.content}>
            <View style={styles.heading}>
              <View style={styles.titleRow}>
                <AppText
                  numberOfLines={1}
                  style={[styles.name, hasUnread && styles.unreadName]}
                  variant="subheadline"
                >
                  {school.name}
                </AppText>
                {school.isVerified ? <VerifiedSchoolSeal compact /> : null}
              </View>
              {last ? (
                <AppText
                  color={hasUnread ? palette.electric : palette.muted}
                  numberOfLines={1}
                  variant="caption2"
                >
                  {relativeMessageDate(
                    last.createdAt,
                    new Date(),
                    i18n.resolvedLanguage ?? i18n.language ?? 'fr',
                  )}
                </AppText>
              ) : null}
            </View>
            <AppText
              color={palette.bronze}
              numberOfLines={1}
              style={styles.members}
              variant="caption2"
            >
              {memberLine}
            </AppText>
            <AppText
              color={hasUnread ? palette.text : palette.muted}
              numberOfLines={1}
              style={hasUnread && styles.unreadPreview}
              variant="caption"
            >
              {preview}
            </AppText>
          </View>
          {hasUnread ? (
            <LinearGradient
              accessibilityElementsHidden
              colors={gradients.hero}
              style={[styles.unread, unread > 9 && styles.unreadWide]}
            >
              <AppText color={billetInk} style={styles.unreadText} variant="caption2">
                {unread > 99 ? '99+' : unread}
              </AppText>
            </LinearGradient>
          ) : (
            <Ionicons color={palette.muted} name="chevron-forward" size={17} />
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 3 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  members: { fontWeight: '700' },
  name: { flex: 1, fontWeight: '700' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  titleRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.tight },
  unread: {
    alignItems: 'center',
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 22,
  },
  unreadName: { fontWeight: '900' },
  unreadPreview: { fontWeight: '600' },
  unreadText: { fontFamily: typography.monoSemibold, fontWeight: '800' },
  unreadWide: { paddingHorizontal: 5 },
});
