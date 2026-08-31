import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { MessageAttachmentCard } from './message-attachments';
import { MessageReactionBar, ReceiptChecks } from './message-controls';
import { receiptForMessage, type DirectMessage, type MessageReactionEmoji } from './message-model';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients } from '@/theme/tokens';

export function MessageBubble({
  attachmentIsLoading = false,
  message,
  mine,
  onLongPress,
  onOpenAttachment,
  onReactionPress,
}: {
  attachmentIsLoading?: boolean;
  message: DirectMessage;
  mine: boolean;
  onLongPress: () => void;
  onOpenAttachment: () => void;
  onReactionPress: (emoji: MessageReactionEmoji) => void;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const bubbleContents = (
    <View style={styles.bubbleContents}>
      {message.deletedAt ? (
        <View style={styles.deletedRow}>
          <Ionicons color={mine ? `${billetInk}99` : palette.muted} name="ban-outline" size={15} />
          <AppText
            color={mine ? `${billetInk}99` : palette.muted}
            style={styles.deletedText}
            variant="subheadline"
          >
            {t('Message supprimé')}
          </AppText>
        </View>
      ) : message.attachment ? (
        <MessageAttachmentCard
          attachment={message.attachment}
          isLoading={attachmentIsLoading}
          onOpen={onOpenAttachment}
        />
      ) : null}
      {message.text ? (
        <AppText color={mine ? billetInk : palette.text} variant="subheadline">
          {message.text}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.wrapper, mine ? styles.mineRow : styles.theirRow]}>
      <View style={[styles.content, mine ? styles.mineContent : styles.theirContent]}>
        <Pressable
          accessibilityHint={
            message.deletedAt ? undefined : t('Maintiens pour afficher les actions')
          }
          delayLongPress={260}
          disabled={Boolean(message.deletedAt)}
          onLongPress={onLongPress}
          style={({ pressed }) => pressed && !message.deletedAt && styles.pressed}
        >
          {mine ? (
            <LinearGradient colors={gradients.hero} style={styles.bubble}>
              {bubbleContents}
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.bubble,
                { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 },
              ]}
            >
              {bubbleContents}
            </View>
          )}
        </Pressable>
        <MessageReactionBar onPress={onReactionPress} reactions={message.reactions} />
        <View style={styles.metadata}>
          {message.editedAt && !message.deletedAt ? (
            <AppText color={palette.muted} variant="caption2">
              {t('Modifié')}
            </AppText>
          ) : null}
          <AppText color={palette.muted} variant="caption2">
            {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(message.createdAt))}
          </AppText>
          {mine ? <ReceiptChecks receipt={receiptForMessage(message)} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 20, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 10 },
  bubbleContents: { gap: 6 },
  content: { gap: 3, maxWidth: '100%' },
  deletedRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  deletedText: { fontStyle: 'italic' },
  metadata: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  mineContent: { alignItems: 'flex-end' },
  mineRow: { justifyContent: 'flex-end', paddingLeft: 56 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  theirContent: { alignItems: 'flex-start' },
  theirRow: { justifyContent: 'flex-start', paddingRight: 56 },
  wrapper: { flexDirection: 'row', width: '100%' },
});
