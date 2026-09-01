import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_REACTION_CHOICES,
  messageDayLabel,
  type DirectMessage,
  type MessageReactionEmoji,
  type MessageReactionSummary,
  type MessageReceipt,
} from './message-model';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function MessageDayDivider({ date }: { date: string }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  return (
    <View accessibilityRole="header" style={styles.dayRow}>
      <View style={[styles.dayLine, { backgroundColor: palette.border }]} />
      <View style={[styles.dayPill, { backgroundColor: `${palette.card}E6` }]}>
        <AppText color={palette.muted} style={styles.dayLabel} variant="caption2">
          {messageDayLabel(date, new Date(), i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
            today: t("Aujourd'hui"),
            yesterday: t('Hier'),
          })}
        </AppText>
      </View>
      <View style={[styles.dayLine, { backgroundColor: palette.border }]} />
    </View>
  );
}

export function ReceiptChecks({ receipt }: { receipt: MessageReceipt }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const color = receipt === 'read' ? palette.electric : palette.muted;
  const label = receipt === 'read' ? t('Lu') : receipt === 'delivered' ? t('Reçu') : t('Envoyé');
  return (
    <View
      accessibilityLabel={label}
      style={[styles.receipt, receipt !== 'sent' && styles.receiptDouble]}
    >
      <Ionicons color={color} name="checkmark" size={11} style={styles.receiptFirst} />
      {receipt !== 'sent' ? (
        <Ionicons color={color} name="checkmark" size={11} style={styles.receiptSecond} />
      ) : null}
    </View>
  );
}

export function MessageReactionBar({
  onPress,
  reactions,
}: {
  onPress: (emoji: MessageReactionEmoji) => void;
  reactions: readonly MessageReactionSummary[];
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (reactions.length === 0) return null;
  return (
    <View style={styles.reactionBar}>
      {reactions.map((reaction) => (
        <Pressable
          accessibilityLabel={`${t('Réagir')} ${reaction.emoji}, ${reaction.count}`}
          accessibilityRole="button"
          key={reaction.emoji}
          onPress={() => onPress(reaction.emoji)}
          style={({ pressed }) => [
            styles.reaction,
            {
              backgroundColor: reaction.isMine ? `${palette.electric}2E` : palette.card,
              borderColor: reaction.isMine ? `${palette.electric}A6` : palette.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <AppText style={styles.emoji}>{reaction.emoji}</AppText>
          {reaction.count > 1 ? (
            <AppText style={styles.reactionCount} variant="caption2">
              {reaction.count}
            </AppText>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function TypingBubble() {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((value) => (value + 1) % 3), 320);
    return () => clearInterval(timer);
  }, []);
  return (
    <View accessibilityLabel={t('En train d’écrire…')} style={styles.typingRow}>
      <View
        style={[
          styles.typingBubble,
          { backgroundColor: palette.card, borderColor: palette.border },
        ]}
      >
        {[0, 1, 2].map((dot) => (
          <View
            key={dot}
            style={[
              styles.typingDot,
              {
                backgroundColor: palette.muted,
                opacity: phase === dot ? 1 : 0.35,
                transform: [{ translateY: phase === dot ? -2 : 0 }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function MessageActionsModal({
  message,
  onClose,
  onDelete,
  onEdit,
  onReact,
  userId,
}: {
  message: DirectMessage;
  onClose: () => void;
  onDelete: (message: DirectMessage) => void;
  onEdit: (message: DirectMessage) => void;
  onReact: (message: DirectMessage, emoji: MessageReactionEmoji) => void;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const mine = message.senderId === userId;
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={t('Fermer')} onPress={onClose} style={styles.backdrop} />
        <View
          style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />
          <View style={styles.sheetHeader}>
            <AppText style={styles.sheetHeaderTitle} variant="title">
              {t('Réagir')}
            </AppText>
            <Pressable
              accessibilityLabel={t('Fermer')}
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: palette.inset }]}
            >
              <Ionicons color={palette.text} name="close" size={19} />
            </Pressable>
          </View>
          <View style={styles.reactionChoices}>
            {MESSAGE_REACTION_CHOICES.map((emoji) => (
              <Pressable
                accessibilityLabel={`${t('Réagir')} ${emoji}`}
                accessibilityRole="button"
                key={emoji}
                onPress={() => {
                  onReact(message, emoji);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.reactionChoice,
                  { backgroundColor: palette.inset },
                  pressed && styles.pressed,
                ]}
              >
                <AppText style={styles.reactionChoiceEmoji}>{emoji}</AppText>
              </Pressable>
            ))}
          </View>
          {mine && message.text ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onEdit(message);
              }}
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="pencil" size={19} />
              <AppText>{t('Modifier')}</AppText>
            </Pressable>
          ) : null}
          {mine ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onDelete(message);
              }}
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <Ionicons color={palette.error} name="trash" size={19} />
              <AppText color={palette.error}>{t('Supprimer pour tout le monde')}</AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export function MessageEditModal({
  message,
  onClose,
  onSave,
}: {
  message: DirectMessage;
  onClose: () => void;
  onSave: (message: DirectMessage, text: string) => void;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [text, setText] = useState(message.text);
  const clean = text.trim();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <Pressable accessibilityLabel={t('Fermer')} onPress={onClose} style={styles.backdrop} />
        <View style={[styles.editSheet, { backgroundColor: palette.background }]}>
          <View style={styles.editHeader}>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <AppText color={palette.electric}>{t('Annuler')}</AppText>
            </Pressable>
            <AppText variant="title">{t('Modifier le message')}</AppText>
            <Pressable
              accessibilityRole="button"
              disabled={!clean || text.length > MESSAGE_MAX_LENGTH}
              onPress={() => {
                onSave(message, clean);
                onClose();
              }}
              style={!clean || text.length > MESSAGE_MAX_LENGTH ? styles.disabled : undefined}
            >
              <AppText color={palette.electric} style={styles.saveText}>
                {t('Enregistrer')}
              </AppText>
            </Pressable>
          </View>
          <AppText color={palette.muted} variant="subheadline">
            {t('Corrige ton message')}
          </AppText>
          <TextInput
            autoFocus
            maxLength={MESSAGE_MAX_LENGTH}
            multiline
            onChangeText={setText}
            placeholder={t('Ton message…')}
            placeholderTextColor={palette.muted}
            selectionColor={palette.electric}
            style={[
              styles.editInput,
              { backgroundColor: palette.card, borderColor: palette.border, color: palette.text },
            ]}
            value={text}
          />
          <AppText color={palette.muted} style={styles.counter} variant="caption2">
            {text.length}/{MESSAGE_MAX_LENGTH}
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
  },
  backdrop: {
    backgroundColor: 'rgba(5,8,20,0.56)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  counter: { textAlign: 'right' },
  closeButton: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dayLabel: { fontWeight: '600' },
  dayLine: { flex: 1, height: 1 },
  dayPill: { borderRadius: radii.round, paddingHorizontal: 10, paddingVertical: 5 },
  dayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
    width: '100%',
  },
  disabled: { opacity: 0.4 },
  editHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editInput: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 112,
    padding: 14,
    textAlignVertical: 'top',
  },
  editSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.sm,
    minHeight: '58%',
    padding: spacing.md,
  },
  emoji: { fontSize: 14, lineHeight: 17 },
  grabber: { alignSelf: 'center', borderRadius: 2, height: 4, width: 36 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  reaction: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  reactionChoice: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 42,
    justifyContent: 'center',
    width: 40,
  },
  reactionChoiceEmoji: { fontSize: 22, lineHeight: 27 },
  reactionChoices: { flexDirection: 'row', gap: spacing.xxs, justifyContent: 'space-between' },
  reactionCount: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  receipt: { height: 12, position: 'relative', width: 11 },
  receiptDouble: { width: 16 },
  receiptFirst: { left: 0, position: 'absolute', top: 0 },
  receiptSecond: { left: 4.5, position: 'absolute', top: 0 },
  saveText: { fontWeight: '700' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    paddingBottom: 28,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sheetHeader: { alignItems: 'center', flexDirection: 'row' },
  sheetHeaderTitle: { flex: 1 },
  typingBubble: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  typingDot: { borderRadius: 3.5, height: 7, width: 7 },
  typingRow: { alignItems: 'flex-start', paddingRight: 56, width: '100%' },
});
