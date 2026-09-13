import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { SettingsSection, SettingsShell } from './settings-components';

import { AppText } from '@/components/ui/app-text';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useDispoTheme, type ThemePreference } from '@/theme/theme-context';
import type { DispoTheme } from '@/theme/themes';
import {
  elevation,
  insetStyle,
  keyEdgeWidth,
  pressedStyle,
  radii,
  spacing,
  type DispoPalette,
} from '@/theme/tokens';

const appearanceOptions: readonly { label: string; value: ThemePreference }[] = [
  { label: 'Système', value: 'system' },
  { label: 'Clair', value: 'light' },
  { label: 'Sombre', value: 'dark' },
];

/**
 * Sélecteur de thème : clair / sombre / système en tête, puis une grille de
 * nuanciers — chaque thème est prévisualisé dans le schéma courant (fond,
 * carte, touche accent, texte). Un tap applique le thème à toute l'app.
 */
export function ThemePickerScreen() {
  const { dark, palette, preference, setPreference, setThemeId, themeId, themes } = useDispoTheme();
  const { t } = useTranslation();
  const scheme = dark ? 'dark' : 'light';

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Thème') }} />
      <SettingsShell nativeHeader>
        <SettingsSection title={t('Apparence')}>
          <View style={styles.appearance}>
            <SegmentedControl<ThemePreference>
              onChange={setPreference}
              options={appearanceOptions.map((option) => ({
                label: t(option.label),
                value: option.value,
              }))}
              value={preference}
            />
          </View>
        </SettingsSection>

        <SettingsSection
          footer={t(
            'Le bleu Jazz reste la couleur de Dispo. Choisis une autre teinte : l’aperçu s’applique tout de suite.',
          )}
          title={t('Couleur')}
        >
          <View accessibilityRole="radiogroup" style={styles.grid}>
            {themes.map((theme) => (
              <ThemeSwatch
                key={theme.id}
                current={palette}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setThemeId(theme.id);
                }}
                preview={scheme === 'dark' ? theme.dark : theme.light}
                selected={theme.id === themeId}
                theme={theme}
              />
            ))}
          </View>
        </SettingsSection>
      </SettingsShell>
    </>
  );
}

function ThemeSwatch({
  current,
  onPress,
  preview,
  selected,
  theme,
}: {
  /** Palette active, pour le cadre et la coche. */
  current: DispoPalette;
  onPress: () => void;
  /** Palette prévisualisée (le thème dans le schéma courant). */
  preview: DispoPalette;
  selected: boolean;
  theme: DispoTheme;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={t(theme.name)}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.swatch, pressed && pressedStyle]}
    >
      <View
        style={[
          styles.preview,
          { backgroundColor: preview.background, borderColor: preview.edge },
          selected && { borderColor: current.accent, borderWidth: 2 },
        ]}
      >
        <View
          style={[
            styles.previewCard,
            { backgroundColor: preview.card, borderColor: preview.edge },
            elevation(1, preview),
          ]}
        >
          <View style={styles.previewRow}>
            <View style={[styles.previewDot, { backgroundColor: preview.accent }]} />
            <View style={[styles.previewLine, { backgroundColor: preview.text }]} />
          </View>
          <View
            style={[
              styles.previewLine,
              styles.previewLineMuted,
              { backgroundColor: preview.muted },
            ]}
          />
          <View
            style={[
              styles.previewKey,
              { backgroundColor: preview.accent, borderBottomColor: preview.accentDeep },
            ]}
          />
        </View>
        <View style={[styles.previewRail, insetStyle(preview)]} />
      </View>
      <View style={styles.name}>
        <AppText
          color={selected ? current.text : current.muted}
          numberOfLines={1}
          style={styles.nameText}
          variant="subheadline"
          weight={selected ? 'semibold' : 'medium'}
        >
          {t(theme.name)}
        </AppText>
        {selected ? (
          <Ionicons color={current.electric} name="checkmark-circle" size={18} />
        ) : (
          <View style={styles.nameSpacer} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  appearance: { padding: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  name: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    justifyContent: 'center',
    minHeight: 24,
  },
  nameSpacer: { height: 18, width: 18 },
  nameText: { flexShrink: 1 },
  preview: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    padding: spacing.xs,
  },
  previewCard: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.tight,
    padding: spacing.xs,
  },
  previewDot: { borderRadius: radii.round, height: 10, width: 10 },
  previewKey: {
    borderBottomWidth: keyEdgeWidth,
    borderRadius: radii.xs,
    height: 14,
    marginTop: spacing.xxs,
    width: '60%',
  },
  previewLine: { borderRadius: 2, flex: 1, height: 6 },
  previewLineMuted: { flex: 0, width: '55%' },
  previewRail: { borderRadius: radii.xs, height: 12 },
  previewRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  swatch: { flexBasis: '46%', flexGrow: 1, gap: spacing.tight },
});
