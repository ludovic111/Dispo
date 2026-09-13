import { createContext, useContext, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { AppText } from './app-text';
import { GrainOverlay } from './dispo-background';

import { useDispoTheme } from '@/theme/theme-context';
import { elevation, radii, scrimFor, spacing } from '@/theme/tokens';

/** Repli quand aucun `SafeAreaProvider` n'est monté (tests, aperçus). */
const fallbackInsetsContext = createContext<EdgeInsets | null>(null);

/** Voile historique (thème Jazz). Préférer `scrimFor(palette)`. */
export const scrimColor = 'rgba(5, 8, 20, 0.6)';

/**
 * Feuille montante : voile, poignée en creux, surface grainée, titre
 * optionnel. Toutes les feuilles d'action / de choix de l'app passent par ici.
 */
export function BottomSheet({
  avoidKeyboard = false,
  children,
  onClose,
  title,
  visible,
}: PropsWithChildren<{
  /** Remonte la feuille au-dessus du clavier (feuilles avec champ de saisie). */
  avoidKeyboard?: boolean | undefined;
  onClose: () => void;
  title?: string | undefined;
  visible: boolean;
}>) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const insets = useContext(SafeAreaInsetsContext ?? fallbackInsetsContext);
  const bottomInset = insets?.bottom ?? 0;
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={avoidKeyboard}
        style={styles.root}
      >
        <Pressable
          accessibilityLabel={t('Fermer')}
          accessibilityRole="button"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: scrimFor(palette) }]}
        />
        <View style={[styles.shadow, elevation(3, palette)]}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: palette.cardElevated,
                borderColor: palette.edge,
                paddingBottom: Math.max(bottomInset, spacing.md),
              },
            ]}
          >
            <GrainOverlay />
            <View
              pointerEvents="none"
              style={[styles.highlight, { backgroundColor: palette.highlight }]}
            />
            <View
              style={[
                styles.handle,
                {
                  backgroundColor: palette.inset,
                  borderBottomColor: palette.highlight,
                  borderTopColor: palette.edge,
                },
              ]}
            />
            {title ? (
              <AppText numberOfLines={2} style={styles.title} variant="title3">
                {title}
              </AppText>
            ) : null}
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: 'center',
    borderBottomWidth: 1,
    borderRadius: radii.round,
    borderTopWidth: 1,
    height: 6,
    marginBottom: spacing.sm,
    width: 40,
  },
  highlight: { height: 1, left: radii.xl, position: 'absolute', right: radii.xl, top: 0 },
  root: { flex: 1, justifyContent: 'flex-end' },
  shadow: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, maxHeight: '88%' },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    maxHeight: '100%',
    overflow: 'hidden',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  title: { marginBottom: spacing.xs },
});
