import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

export interface SegmentOption<T extends string> {
  /** Compteur affiché après le libellé (« Annonces · 3 »). */
  count?: number;
  label: string;
  value: T;
}

/**
 * Contrôle segmenté unique de l'app : rail en creux, option sélectionnée sur
 * carte. Utilisé pour tout choix exclusif entre 2 et 4 vues.
 */
export function SegmentedControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  value: T;
}) {
  const { palette } = useDispoTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.rail, { backgroundColor: palette.inset, borderColor: palette.border }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && { backgroundColor: palette.card, borderColor: palette.border },
              pressed && !selected && pressedStyle,
            ]}
          >
            <AppText
              color={selected ? palette.text : palette.muted}
              numberOfLines={1}
              variant="subheadline"
              weight={selected ? 'semibold' : 'medium'}
            >
              {option.label}
              {option.count ? ` · ${option.count}` : ''}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Onglets soulignés (fiche profil, fiche morceau). Même rythme que le
 * contrôle segmenté mais avec un trait d'accent, pour les vues à contenu long.
 */
export function UnderlineTabs<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  value: T;
}) {
  const { palette } = useDispoTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.tabs, { borderBottomColor: palette.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.tab, pressed && !selected && pressedStyle]}
          >
            <AppText
              color={selected ? palette.electric : palette.muted}
              numberOfLines={1}
              variant="subheadline"
              weight="semibold"
            >
              {option.label}
              {option.count ? ` · ${option.count}` : ''}
            </AppText>
            <View style={[styles.underline, selected && { backgroundColor: palette.electric }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget - 8,
    paddingHorizontal: spacing.xs,
  },
  rail: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: spacing.xxs,
  },
  tab: {
    alignItems: 'center',
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: 'flex-end',
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  tabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  underline: { alignSelf: 'stretch', borderRadius: 1, height: 2 },
});
