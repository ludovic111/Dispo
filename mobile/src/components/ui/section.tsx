import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, radii, spacing } from '@/theme/tokens';

export function SectionHeader({ subtitle, title }: { subtitle?: string; title: string }) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.sectionRow}>
      <View
        style={[
          styles.sectionAccent,
          { backgroundColor: palette.electric, height: subtitle ? 34 : 22 },
        ]}
      />
      <View style={styles.sectionCopy}>
        <AppText style={styles.sectionTitle} variant="display">
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={palette.muted} variant="caption">
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function PillButton({
  active = false,
  badge,
  icon,
  onPress,
  title,
}: {
  active?: boolean;
  badge?: number;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  title: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? `${palette.electric}33` : palette.card,
          borderColor: active ? `${palette.electric}59` : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={active ? palette.electric : palette.text} name={icon} size={15} />
      <AppText color={active ? palette.electric : palette.text} style={styles.pillText}>
        {title}
      </AppText>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: palette.inset }]}>
          <AppText style={styles.badgeText}>{badge}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function PromoBanner({
  icon,
  onPress,
  style = 'premium',
  subtitle,
  title,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  style?: 'premium' | 'hero';
  subtitle: string;
  title: string;
}) {
  const foreground = style === 'hero' ? billetInk : '#F0F4FF';
  const colors = style === 'hero' ? gradients.hero : gradients.premium;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <LinearGradient colors={colors} style={styles.promo}>
        <View style={[styles.promoIcon, { backgroundColor: `${foreground}1F` }]}>
          <Ionicons color={foreground} name={icon} size={20} />
        </View>
        <View style={styles.promoCopy}>
          <AppText color={foreground} style={styles.promoTitle}>
            {title}
          </AppText>
          <AppText color={foreground} style={styles.promoSubtitle} variant="caption">
            {subtitle}
          </AppText>
        </View>
        <Ionicons color={`${foreground}B3`} name="chevron-forward" size={14} />
      </LinearGradient>
    </Pressable>
  );
}

export function HeaderAction({
  badge,
  children,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  badge?: number;
  children?: ReactNode;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  label?: string;
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerAction,
        { backgroundColor: palette.card, borderColor: palette.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children ?? (icon ? <Ionicons color={palette.text} name={icon} size={19} /> : null)}
      {badge ? (
        <View style={[styles.notificationBadge, { backgroundColor: palette.signal }]}>
          <AppText color="#FFFFFF" style={styles.notificationText}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radii.round, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: 'SplineSansMonoSemibold', fontSize: 11 },
  disabled: { opacity: 0.45 },
  headerAction: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  notificationBadge: {
    alignItems: 'center',
    borderRadius: 9,
    minHeight: 17,
    minWidth: 17,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -5,
    top: -4,
  },
  notificationText: { fontSize: 9, fontWeight: '900', lineHeight: 17 },
  pill: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  promo: {
    alignItems: 'center',
    borderRadius: radii.promo,
    flexDirection: 'row',
    gap: spacing.cluster,
    padding: spacing.md,
  },
  promoCopy: { flex: 1, gap: 3 },
  promoIcon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  promoSubtitle: { opacity: 0.85 },
  promoTitle: { fontSize: 15, fontWeight: '800' },
  sectionAccent: { borderRadius: 2, width: 3 },
  sectionCopy: { flex: 1, gap: 2 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.section },
  sectionTitle: { fontSize: 19, lineHeight: 23 },
});
