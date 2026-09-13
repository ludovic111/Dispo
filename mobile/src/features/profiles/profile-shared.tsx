import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/pressable';
import type { ProfileSocialNetwork } from '@/domain/profile';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, pressedStyle, spacing } from '@/theme/tokens';

export const socialIcons: Record<ProfileSocialNetwork, ComponentProps<typeof Ionicons>['name']> = {
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  x: 'logo-twitter',
  youtube: 'logo-youtube',
};

export interface ProfileStat {
  accessibilityLabel?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  value: string;
}

/** Carte de statistiques d'un profil (note / niveau, abonnés, collabs). Même forme partout. */
export function ProfileStatsCard({ stats }: { stats: ProfileStat[] }) {
  const { palette } = useDispoTheme();
  return (
    <Card padding={spacing.xs}>
      <View style={styles.stats}>
        {stats.map((stat, index) => {
          const content = (
            <>
              <View style={styles.statValueRow}>
                {stat.icon ? (
                  <Ionicons color={palette.electric} name={stat.icon} size={13} />
                ) : null}
                <AppText numberOfLines={1} variant="mono">
                  {stat.value}
                </AppText>
              </View>
              <AppText
                color={palette.muted}
                numberOfLines={1}
                style={styles.statLabel}
                variant="caption2"
              >
                {stat.label}
              </AppText>
            </>
          );
          const divider = index > 0 ? { borderLeftColor: palette.border } : null;
          return stat.onPress ? (
            <Pressable
              accessibilityLabel={stat.accessibilityLabel ?? `${stat.value} ${stat.label}`}
              accessibilityRole="button"
              key={stat.label}
              onPress={stat.onPress}
              style={({ pressed }) => [
                styles.stat,
                index > 0 && styles.statDivider,
                divider,
                pressed && pressedStyle,
              ]}
            >
              {content}
            </Pressable>
          ) : (
            <View
              accessibilityLabel={stat.accessibilityLabel ?? `${stat.value} ${stat.label}`}
              accessible
              key={stat.label}
              style={[styles.stat, index > 0 && styles.statDivider, divider]}
            >
              {content}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/** Boutons ronds vers les réseaux du profil, plus une action optionnelle « Ajouter ». */
export function ProfileSocialLinks({
  links,
  onAdd,
  addLabel,
}: {
  addLabel?: string;
  links: { network: ProfileSocialNetwork; onPress: () => void }[];
  onAdd?: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.links}>
      {links.map(({ network, onPress }) => (
        <IconButton
          accessibilityLabel={network}
          icon={socialIcons[network]}
          iconColor={palette.text}
          key={network}
          onPress={onPress}
        />
      ))}
      {onAdd && addLabel ? (
        <IconButton
          accessibilityLabel={addLabel}
          icon="add"
          iconColor={palette.muted}
          onPress={onAdd}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stat: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xxs,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    minWidth: 0,
    paddingHorizontal: spacing.xxs,
  },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth },
  statLabel: { textAlign: 'center' },
  statValueRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  stats: { flexDirection: 'row' },
});
