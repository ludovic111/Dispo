import { createContext, useContext, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

/** Repli quand aucun `SafeAreaProvider` n'est monté (tests, aperçus). */
const fallbackInsetsContext = createContext<EdgeInsets | null>(null);

/** Voile unique posé derrière les feuilles et les menus. */
export const scrimColor = 'rgba(5, 8, 20, 0.6)';

/**
 * Feuille montante : voile, poignée, surface carte, titre optionnel.
 * Toutes les feuilles d'action / de choix de l'app passent par ici.
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
          style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor }]}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: Math.max(bottomInset, spacing.md),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: palette.border }]} />
          {title ? (
            <AppText numberOfLines={2} style={styles.title} variant="title3">
              {title}
            </AppText>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: 'center',
    borderRadius: radii.round,
    height: 5,
    marginBottom: spacing.sm,
    width: 40,
  },
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    maxHeight: '88%',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  title: { marginBottom: spacing.xs },
});
