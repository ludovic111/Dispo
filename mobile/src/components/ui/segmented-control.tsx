import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import {
  elevation,
  insetStyle,
  keyEdgeWidth,
  minimumTouchTarget,
  pressedStyle,
  radii,
  spacing,
} from '@/theme/tokens';

export interface SegmentOption<T extends string> {
  /** Compteur affiché après le libellé (« Annonces · 3 »). */
  count?: number;
  label: string;
  value: T;
}

const railPadding = spacing.xxs;
const optionGap = spacing.xxs;

/**
 * Contrôle segmenté unique de l'app : rail en creux, touche relevée qui
 * glisse sous l'option choisie (ressort natif, sauté si « Réduire les
 * animations » est actif). Utilisé pour tout choix exclusif entre 2 et 4 vues.
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
  const reduceMotion = useReducedMotion();
  const [railWidth, setRailWidth] = useState(0);
  const count = Math.max(1, options.length);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const optionWidth = Math.max(0, (railWidth - railPadding * 2 - optionGap * (count - 1)) / count);
  const [position] = useState(() => new Animated.Value(index));

  useEffect(() => {
    if (reduceMotion) {
      position.setValue(index);
      return;
    }
    Animated.spring(position, {
      damping: 20,
      mass: 0.7,
      stiffness: 260,
      toValue: index,
      useNativeDriver: true,
    }).start();
  }, [index, position, reduceMotion]);

  const measure = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width !== railWidth) setRailWidth(width);
  };
  const translateX = Animated.multiply(position, optionWidth + optionGap);

  return (
    <View accessibilityRole="tablist" onLayout={measure} style={[styles.rail, insetStyle(palette)]}>
      {railWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            elevation(1, palette),
            {
              backgroundColor: palette.cardElevated,
              borderBottomColor: palette.edge,
              borderColor: palette.edge,
              transform: [{ translateX }],
              width: optionWidth,
            },
          ]}
        >
          <View style={[styles.thumbHighlight, { backgroundColor: palette.highlight }]} />
        </Animated.View>
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.option, pressed && !selected && pressedStyle]}
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
    <View accessibilityRole="tablist" style={[styles.tabs, { borderBottomColor: palette.edge }]}>
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
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget - 8,
    paddingHorizontal: spacing.xs,
  },
  rail: {
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: optionGap,
    padding: railPadding,
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
  thumb: {
    borderBottomWidth: keyEdgeWidth,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: railPadding,
    left: railPadding,
    position: 'absolute',
    top: railPadding,
  },
  thumbHighlight: {
    height: 1,
    left: radii.sm,
    position: 'absolute',
    right: radii.sm,
    top: 0,
  },
  underline: { alignSelf: 'stretch', borderRadius: 1, height: 2 },
});
