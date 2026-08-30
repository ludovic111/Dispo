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
  title: string;
}

export function ScreenHeader({ action, eyebrow, icon, title }: ScreenHeaderProps) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        {eyebrow ? (
          <AppText color={palette.bronze} variant="label">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText numberOfLines={1} variant="display">
          {title}
        </AppText>
      </View>
      {action ??
        (icon ? (
          <View
            style={[styles.icon, { backgroundColor: palette.card, borderColor: palette.border }]}
          >
            <Ionicons color={palette.electric} name={icon} size={22} />
          </View>
        ) : null)}
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerText: { flex: 1, gap: 2 },
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
  safe: { flex: 1 },
});
