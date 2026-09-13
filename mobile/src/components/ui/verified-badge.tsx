import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { StyleProp, TextStyle } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';

const sizes = { md: 18, sm: 14 } as const;

/**
 * Blue checkmark shown next to the name of every Premium member (store
 * subscription or school grant alike — `profiles.is_premium` mirrors both).
 */
export function VerifiedBadge({
  size = 'md',
  style,
}: {
  size?: keyof typeof sizes;
  style?: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  return (
    <Ionicons
      accessibilityLabel={t('Membre Premium')}
      accessibilityRole="image"
      color={palette.electric}
      name="checkmark-circle"
      size={sizes[size]}
      style={style}
    />
  );
}
