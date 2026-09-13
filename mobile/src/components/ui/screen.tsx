import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './app-text';
import { Card } from './card';
import { DispoBackground } from './dispo-background';
import { DispoButton } from './pressable';

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
  /** Action(s) à droite : `IconButton` ou `NativeHeaderButton`. */
  action?: ReactNode | undefined;
  icon?: ComponentProps<typeof Ionicons>['name'] | undefined;
  iconColor?: string | undefined;
  inset?: boolean | undefined;
  /** Action à gauche, typiquement un bouton Retour / Fermer. */
  leadingAction?: ReactNode | undefined;
  subtitle?: string | undefined;
  title: string;
}

/**
 * En-tête d'écran personnalisé (onglets et modales sans header natif).
 * Titre Fraunces, sous-titre optionnel. Pas de surtitre décoratif.
 */
export function ScreenHeader({
  action,
  icon,
  iconColor,
  inset = true,
  leadingAction,
  subtitle,
  title,
}: ScreenHeaderProps) {
  const { palette } = useDispoTheme();
  return (
    <View style={[styles.header, !inset && styles.headerWithoutInset]}>
      {leadingAction ?? null}
      {icon ? (
        <View style={[styles.icon, { backgroundColor: palette.cardMuted }]}>
          <Ionicons color={iconColor ?? palette.electric} name={icon} size={20} />
        </View>
      ) : null}
      <View style={styles.headerText}>
        <AppText numberOfLines={2} variant="display">
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={palette.muted} numberOfLines={2} variant="subheadline">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ?? null}
    </View>
  );
}

/**
 * En-tête de modale : action à gauche (Annuler / Fermer), titre centré,
 * action à droite (OK / Enregistrer). Une seule forme pour toutes les feuilles.
 */
export function ModalHeader({
  leading,
  title,
  trailing,
}: {
  leading?: ReactNode | undefined;
  title: string;
  trailing?: ReactNode | undefined;
}) {
  return (
    <View style={styles.modalHeader}>
      <View style={styles.modalSide}>{leading ?? null}</View>
      <AppText numberOfLines={1} style={styles.modalTitle} variant="headline">
        {title}
      </AppText>
      <View style={[styles.modalSide, styles.modalSideEnd]}>{trailing ?? null}</View>
    </View>
  );
}

export function LoadingState({ label }: { label?: string | undefined }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View accessibilityRole="progressbar" style={styles.center}>
      <ActivityIndicator color={palette.electric} />
      <AppText color={palette.muted} variant="subheadline">
        {label ?? t('Chargement…')}
      </AppText>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <View style={[styles.stateIcon, { backgroundColor: palette.cardMuted }]}>
        <Ionicons color={palette.signal} name="cloud-offline-outline" size={26} />
      </View>
      <AppText style={styles.centerText} variant="title">
        {t('Erreur')}
      </AppText>
      <AppText color={palette.muted} style={styles.centerText} variant="subheadline">
        {message}
      </AppText>
      {onRetry ? (
        <View style={styles.retry}>
          <DispoButton onPress={onRetry} size="compact" variant="secondary">
            {t('Réessayer')}
          </DispoButton>
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState({
  action,
  icon,
  message,
  title,
}: {
  action?: { label: string; onPress: () => void } | undefined;
  icon: ComponentProps<typeof Ionicons>['name'];
  message: string;
  title: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <Card accessible accessibilityRole="summary" style={styles.emptyCard}>
      <View style={styles.emptyContent}>
        <View style={[styles.stateIcon, { backgroundColor: palette.cardMuted }]}>
          <Ionicons color={palette.electric} name={icon} size={26} />
        </View>
        <AppText numberOfLines={2} style={styles.centerText} variant="title">
          {title}
        </AppText>
        <AppText color={palette.muted} style={styles.centerText} variant="subheadline">
          {message}
        </AppText>
        {action ? (
          <View style={styles.retry}>
            <DispoButton onPress={action.onPress} size="compact" variant="secondary">
              {action.label}
            </DispoButton>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.xs, justifyContent: 'center', padding: spacing.xxl },
  centerText: { textAlign: 'center' },
  emptyCard: { minHeight: 168 },
  emptyContent: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  headerText: { flex: 1, flexShrink: 1, gap: 2 },
  headerWithoutInset: { paddingHorizontal: 0 },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: spacing.xs,
  },
  modalSide: { flexDirection: 'row', minWidth: 72 },
  modalSideEnd: { justifyContent: 'flex-end' },
  modalTitle: { flex: 1, textAlign: 'center' },
  icon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  retry: { alignSelf: 'center', marginTop: spacing.xxs },
  safe: { flex: 1 },
  stateIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.xxs,
    width: 56,
  },
});
