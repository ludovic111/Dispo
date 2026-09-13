import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../app-text';
import { LinkifiedText } from '../linkified-text';

import { useDispoTheme } from '@/theme/theme-context';
import {
  billetInk,
  disabledStyle,
  gradients,
  minimumTouchTarget,
  pressedStyle,
  radii,
  spacing,
  tint,
} from '@/theme/tokens';

export interface ChatBubbleReaction {
  count: number;
  emoji: string;
  mine: boolean;
}

type BubblePressableProps = Pick<
  ComponentProps<typeof Pressable>,
  | 'accessibilityActions'
  | 'accessibilityHint'
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'accessible'
  | 'onAccessibilityAction'
>;

interface ChatBubbleProps extends BubblePressableProps {
  /** Icône / contrôle(s) sous la bulle (répondre, réagir, modifier…). */
  actions?: ReactNode | undefined;
  /** Carte de pièce jointe rendue dans la bulle. */
  attachment?: ReactNode | undefined;
  /** Avatar de l'expéditeur (messages reçus seulement). */
  avatar?: ReactNode | undefined;
  deleted?: boolean | undefined;
  edited?: boolean | undefined;
  /** Élément de fin de la ligne de métadonnées (accusés de lecture). */
  meta?: ReactNode | undefined;
  mine: boolean;
  onLongPress?: (() => void) | undefined;
  onPress?: (() => void) | undefined;
  onReactionPress?: ((emoji: string) => void) | undefined;
  /** Citation du message d'origine, rendue au-dessus du contenu. */
  quote?: ReactNode | undefined;
  reactions?: readonly ChatBubbleReaction[] | undefined;
  reactionsDisabled?: boolean | undefined;
  senderName?: string | undefined;
  text?: string | null | undefined;
  /** Date ISO de création, affichée en heure locale. */
  timestamp: string;
}

/**
 * Bulle de conversation unique (privée, groupe, école) : dégradé bleu jazz
 * pour mes messages, carte pour les autres ; citation, pièce jointe, texte
 * avec liens, réactions, actions en ligne et métadonnées.
 */
export function ChatBubble({
  accessibilityActions,
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  accessible = false,
  actions,
  attachment,
  avatar,
  deleted = false,
  edited = false,
  meta,
  mine,
  onAccessibilityAction,
  onLongPress,
  onPress,
  onReactionPress,
  quote,
  reactions = [],
  reactionsDisabled = false,
  senderName,
  text,
  timestamp,
}: ChatBubbleProps) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const ink = mine ? billetInk : palette.text;
  const mutedInk = mine ? tint(billetInk, 0.6) : palette.muted;
  const contents = (
    <View style={styles.contents}>
      {deleted ? (
        <View style={styles.deletedRow}>
          <Ionicons color={mutedInk} name="ban-outline" size={15} />
          <AppText color={mutedInk} style={styles.deletedText} variant="subheadline">
            {t('Message supprimé')}
          </AppText>
        </View>
      ) : (
        <>
          {quote}
          {attachment}
          {text ? (
            <LinkifiedText
              color={ink}
              linkColor={mine ? billetInk : palette.electric}
              onLongPress={onLongPress}
              variant="subheadline"
            >
              {text}
            </LinkifiedText>
          ) : null}
        </>
      )}
    </View>
  );
  const showControls = !deleted && (reactions.length > 0 || Boolean(actions));

  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      {!mine ? avatar : null}
      <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs]}>
        {!mine && senderName ? (
          <AppText
            color={palette.bronze}
            numberOfLines={1}
            style={styles.sender}
            variant="caption2"
            weight="semibold"
          >
            {senderName}
          </AppText>
        ) : null}
        <Pressable
          accessibilityActions={accessibilityActions}
          accessibilityHint={accessibilityHint}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole={accessibilityRole}
          accessible={accessible}
          delayLongPress={260}
          disabled={!onPress && !onLongPress}
          onAccessibilityAction={onAccessibilityAction}
          onLongPress={onLongPress}
          onPress={onPress}
          style={({ pressed }) => pressed && pressedStyle}
        >
          {mine ? (
            <LinearGradient colors={gradients.hero} style={styles.bubble}>
              {contents}
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.bubble,
                styles.bubbleTheirs,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              {contents}
            </View>
          )}
        </Pressable>
        {showControls ? (
          <View style={[styles.controls, mine && styles.controlsMine]}>
            {reactions.map((reaction) => (
              <Pressable
                accessibilityLabel={`${reaction.emoji}, ${reaction.count}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: reactionsDisabled, selected: reaction.mine }}
                disabled={reactionsDisabled}
                key={reaction.emoji}
                onPress={() => onReactionPress?.(reaction.emoji)}
                style={({ pressed }) => [
                  styles.reaction,
                  {
                    backgroundColor: reaction.mine ? tint(palette.electric, 0.18) : palette.card,
                    borderColor: reaction.mine ? palette.electric : palette.border,
                  },
                  pressed && pressedStyle,
                  reactionsDisabled && disabledStyle,
                ]}
              >
                <AppText style={styles.reactionText} variant="caption2">
                  {reaction.count > 1 ? `${reaction.emoji} ${reaction.count}` : reaction.emoji}
                </AppText>
              </Pressable>
            ))}
            {actions}
          </View>
        ) : null}
        <View style={styles.meta}>
          {edited && !deleted ? (
            <AppText color={palette.muted} variant="caption2">
              {t('Modifié')}
            </AppText>
          ) : null}
          <AppText color={palette.muted} variant="caption2">
            {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(timestamp))}
          </AppText>
          {meta}
        </View>
      </View>
    </View>
  );
}

/** Petite action icône sous une bulle ; la zone tactile atteint la taille minimale par `hitSlop`. */
export function ChatInlineAction({
  accessibilityLabel,
  color,
  disabled = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  color?: string;
  disabled?: boolean;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={(minimumTouchTarget - inlineActionSize) / 2}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inlineAction,
        pressed && pressedStyle,
        disabled && disabledStyle,
      ]}
    >
      <Ionicons color={color ?? palette.muted} name={icon} size={17} />
    </Pressable>
  );
}

const inlineActionSize = 24;

const styles = StyleSheet.create({
  bubble: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  bubbleTheirs: { borderWidth: StyleSheet.hairlineWidth },
  column: { flexShrink: 1, gap: spacing.xxs, maxWidth: '84%' },
  columnMine: { alignItems: 'flex-end' },
  columnTheirs: { alignItems: 'flex-start' },
  contents: { gap: spacing.tight },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  controlsMine: { justifyContent: 'flex-end' },
  deletedRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  deletedText: { fontStyle: 'italic' },
  inlineAction: {
    alignItems: 'center',
    height: inlineActionSize,
    justifyContent: 'center',
    width: inlineActionSize,
  },
  meta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  reaction: {
    borderRadius: radii.round,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  reactionText: { fontVariant: ['tabular-nums'] },
  row: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs, width: '100%' },
  rowMine: { justifyContent: 'flex-end' },
  sender: { paddingLeft: spacing.xs },
});
