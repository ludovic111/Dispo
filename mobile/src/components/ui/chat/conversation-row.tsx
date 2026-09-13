import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../app-text';
import { CountBadge } from '../badge';
import { Card } from '../card';

import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

interface ConversationRowProps {
  accessibilityHint?: string | undefined;
  accessibilityLabel?: string | undefined;
  /** Avatar ou icône à gauche. */
  leading: ReactNode;
  /** Date relative du dernier message, à droite du titre. */
  meta?: string | undefined;
  onPress: () => void;
  /** Dernier message ou invitation à écrire. */
  preview: string;
  /** Ligne d'accent sous le titre (instrument, effectif…). */
  subtitle?: string | undefined;
  title: string;
  /** Élément à côté du titre (sceau vérifié…). */
  titleAccessory?: ReactNode | undefined;
  unreadCount?: number | undefined;
}

/**
 * Ligne de liste d'une conversation (privée, groupe, école) : avatar, titre
 * + date, ligne d'accent, aperçu et compteur de non-lus.
 */
export function ConversationRow({
  accessibilityHint,
  accessibilityLabel,
  leading,
  meta,
  onPress,
  preview,
  subtitle,
  title,
  titleAccessory,
  unreadCount = 0,
}: ConversationRowProps) {
  const { palette } = useDispoTheme();
  const unread = unreadCount > 0;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <Card padding={spacing.sm}>
        <View style={styles.row}>
          {leading}
          <View style={styles.copy}>
            <View style={styles.heading}>
              <AppText
                numberOfLines={1}
                style={styles.title}
                variant="headline"
                weight={unread ? 'bold' : 'semibold'}
              >
                {title}
              </AppText>
              {titleAccessory}
              {meta ? (
                <AppText
                  color={unread ? palette.electric : palette.muted}
                  numberOfLines={1}
                  variant="caption2"
                >
                  {meta}
                </AppText>
              ) : null}
            </View>
            {subtitle ? (
              <AppText
                color={palette.electric}
                numberOfLines={1}
                variant="caption"
                weight="semibold"
              >
                {subtitle}
              </AppText>
            ) : null}
            <AppText
              color={unread ? palette.text : palette.muted}
              numberOfLines={1}
              variant="footnote"
              weight={unread ? 'semibold' : 'regular'}
            >
              {preview}
            </AppText>
          </View>
          <CountBadge count={unreadCount} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: { flexShrink: 1 },
});
