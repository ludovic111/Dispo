import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { readableOn } from '@/theme/color';
import { useDispoTheme } from '@/theme/theme-context';
import { onAccent, radii, spacing, tint } from '@/theme/tokens';

interface TagProps {
  color?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  /** `tinted` : fond teinté (défaut) · `solid` : fond plein, texte inversé · `outline` : contour seul. */
  tone?: 'tinted' | 'solid' | 'outline';
}

/** Étiquette non interactive (instrument, style, statut). Pour un choix, utiliser `ChoiceChip`. */
export function Tag({ color, icon, label, tone = 'tinted' }: TagProps) {
  const { palette } = useDispoTheme();
  const resolved = color ?? palette.electric;
  const foreground =
    tone === 'solid' ? readableOn(resolved, [palette.ink, palette.paper, onAccent]) : resolved;
  return (
    <View
      style={[
        styles.tag,
        tone === 'tinted' && {
          backgroundColor: tint(resolved, 0.14),
          borderColor: tint(resolved, 0.28),
          borderWidth: StyleSheet.hairlineWidth,
        },
        tone === 'solid' && { backgroundColor: resolved },
        tone === 'outline' && { borderColor: tint(resolved, 0.5), borderWidth: 1 },
      ]}
    >
      {icon ? <Ionicons color={foreground} name={icon} size={12} /> : null}
      <AppText color={foreground} numberOfLines={1} variant="caption" weight="semibold">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.round,
    flexDirection: 'row',
    gap: spacing.xxs,
    maxWidth: '100%',
    minHeight: 26,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xxs,
  },
});
