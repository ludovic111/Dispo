import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './app-text';
import { BrandLogo } from './brand';
import { Card } from './card';
import { DispoBackground } from './dispo-background';

import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

const screenEdges = ['top', 'bottom'] as const;
const nativeHeaderScreenEdges = ['bottom'] as const;
// NativeTabs owns the bottom inset on Android and adjusts its first scroll
// view automatically on iOS. Reserving the window bottom here does not include
// the floating tab bar and was letting final rows slide underneath it.
const nativeTabScreenEdges = ['top'] as const;

export function screenSafeAreaEdges({
  nativeHeader = false,
  nativeTabRoot = false,
}: {
  nativeHeader?: boolean;
  nativeTabRoot?: boolean;
} = {}) {
  if (nativeHeader) return nativeHeaderScreenEdges;
  return nativeTabRoot ? nativeTabScreenEdges : screenEdges;
}

export function Screen({
  children,
  nativeHeader = false,
  nativeTabRoot = false,
}: PropsWithChildren<{ nativeHeader?: boolean; nativeTabRoot?: boolean }>) {
  return (
    <DispoBackground>
      <SafeAreaView
        edges={screenSafeAreaEdges({ nativeHeader, nativeTabRoot })}
        style={styles.safe}
      >
        {children}
      </SafeAreaView>
    </DispoBackground>
  );
}

interface ScreenHeaderProps {
  action?: ReactNode;
  eyebrow?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  inset?: boolean;
  leadingAction?: ReactNode;
  subtitle?: string;
  title: string;
}

export function ScreenHeader({
  action,
  eyebrow,
  icon,
  iconColor,
  inset = true,
  leadingAction,
  subtitle,
  title,
}: ScreenHeaderProps) {
  const { palette } = useDispoTheme();
  const resolvedIconColor = iconColor ?? palette.electric;
  return (
    <View style={[styles.header, !inset && styles.headerWithoutInset]}>
      {leadingAction ?? null}
      {icon ? (
        <View
          style={[
            styles.icon,
            { backgroundColor: palette.cardMuted, borderColor: `${resolvedIconColor}42` },
          ]}
        >
          <Ionicons color={resolvedIconColor} name={icon} size={18} />
        </View>
      ) : null}
      <View style={styles.headerText}>
        {eyebrow ? (
          <AppText color={palette.electric} style={styles.headerEyebrow} variant="label">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText numberOfLines={2} style={styles.headerTitle} variant="display">
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={palette.muted} style={styles.headerSubtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ?? null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <View
        style={[
          styles.loadingMark,
          { backgroundColor: palette.cardMuted, borderColor: palette.border },
        ]}
      >
        <BrandLogo markSize={30} showWordmark={false} />
        <View style={[styles.loadingSpinner, { backgroundColor: palette.background }]}>
          <ActivityIndicator color={palette.electric} size="small" />
        </View>
      </View>
      <AppText color={palette.muted}>{label ?? t('Chargement…')}</AppText>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <Ionicons color={palette.signal} name="cloud-offline-outline" size={34} />
      <AppText style={styles.centerText} variant="title">
        {t('Erreur')}
      </AppText>
      <AppText color={palette.muted} style={styles.centerText}>
        {message}
      </AppText>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={[styles.retry, { borderColor: palette.border }]}
        >
          <AppText style={styles.retryText}>{t('Réessayer')}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  message,
  title,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  message: string;
  title: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <Card accessible accessibilityRole="summary" style={styles.emptyCard}>
      <View style={styles.emptyContent}>
        <View
          style={[
            styles.emptyIcon,
            { backgroundColor: palette.cardMuted, borderColor: palette.border },
          ]}
        >
          <Ionicons color={palette.electric} name={icon} size={27} />
        </View>
        <AppText numberOfLines={2} style={styles.centerText} variant="title">
          {title}
        </AppText>
        <AppText color={palette.muted} numberOfLines={2} style={styles.centerText}>
          {message}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', padding: spacing.xxl },
  centerText: { textAlign: 'center' },
  emptyCard: { minHeight: 180 },
  emptyContent: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.cluster,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  headerSubtitle: { fontSize: 15, lineHeight: 20 },
  headerEyebrow: { letterSpacing: 1.15 },
  headerText: { flex: 1, flexShrink: 1, gap: 3 },
  headerTitle: { fontSize: 27, lineHeight: 31 },
  headerWithoutInset: { paddingHorizontal: 0 },
  icon: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  retry: {
    borderRadius: radii.button,
    borderWidth: 1,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  retryText: { fontWeight: '800' },
  loadingMark: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  loadingSpinner: {
    alignItems: 'center',
    borderRadius: 10,
    bottom: -5,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -5,
    width: 22,
  },
  safe: { flex: 1 },
});
