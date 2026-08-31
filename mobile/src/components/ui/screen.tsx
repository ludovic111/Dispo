import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './app-text';
import { DispoBackground } from './dispo-background';

import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function Screen({ children }: PropsWithChildren) {
  return (
    <DispoBackground>
      <SafeAreaView edges={['top']} style={styles.safe}>
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
  subtitle?: string;
  title: string;
}

export function ScreenHeader({
  action,
  eyebrow,
  icon,
  iconColor,
  subtitle,
  title,
}: ScreenHeaderProps) {
  const { palette } = useDispoTheme();
  const detail = subtitle ?? eyebrow;
  const resolvedIconColor = iconColor ?? palette.electric;
  return (
    <View style={styles.header}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: `${resolvedIconColor}24` }]}>
          <Ionicons color={resolvedIconColor} name={icon} size={18} />
        </View>
      ) : null}
      <View style={styles.headerText}>
        <AppText numberOfLines={1} style={styles.headerTitle} variant="display">
          {title}
        </AppText>
        {detail ? (
          <AppText color={palette.muted} style={styles.headerSubtitle}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {action ?? null}
    </View>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.electric} size="large" />
      <AppText color={palette.muted}>{label}</AppText>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.center}>
      <Ionicons color={palette.signal} name="cloud-offline-outline" size={34} />
      <AppText style={styles.centerText} variant="title">
        Impossible de charger
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
          <AppText style={styles.retryText}>Réessayer</AppText>
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
    <View style={styles.center}>
      <Ionicons color={palette.bronze} name={icon} size={38} />
      <AppText style={styles.centerText} variant="title">
        {title}
      </AppText>
      <AppText color={palette.muted} style={styles.centerText}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', padding: spacing.xxl },
  centerText: { textAlign: 'center' },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.cluster,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  headerSubtitle: { fontSize: 15, lineHeight: 20 },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { fontSize: 27, lineHeight: 31 },
  icon: {
    alignItems: 'center',
    borderRadius: radii.button,
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
  safe: { flex: 1 },
});
