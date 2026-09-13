import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_REACTION_CHOICES,
  messageDayLabel,
  type DirectMessage,
  type MessageReactionEmoji,
  type MessageReceipt,
} from './message-model';

import { AppText } from '@/components/ui/app-text';
import { ChatDaySeparator } from '@/components/ui/chat/chat-day-separator';
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { ModalHeader } from '@/components/ui/screen';
import { BottomSheet } from '@/components/ui/sheet';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

export function MessageDayDivider({ date }: { date: string }) {
  const { i18n, t } = useTranslation();
  return (
    <ChatDaySeparator
      label={messageDayLabel(date, new Date(), i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
        today: t("Aujourd'hui"),
        yesterday: t('Hier'),
      })}
    />
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
        style={[styles.typingBubble, { backgroundColor: palette.card, borderColor: palette.edge }]}
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
    <BottomSheet onClose={onClose} visible>
      <View style={styles.sheetHeader}>
        <AppText numberOfLines={1} style={styles.sheetTitle} variant="title3">
          {t('Réagir')}
        </AppText>
        <IconButton accessibilityLabel={t('Fermer')} icon="close" onPress={onClose} />
      </View>
      <View style={styles.reactionChoices}>
        {MESSAGE_REACTION_CHOICES.map((emoji) => (
          <Pressable
            accessibilityLabel={`${t('Réagir')} ${emoji}`}
            accessibilityRole="button"
            accessibilityState={{
              selected: message.reactions.some((item) => item.emoji === emoji && item.isMine),
            }}
            key={emoji}
            onPress={() => {
              onReact(message, emoji);
              onClose();
            }}
            style={({ pressed }) => [
              styles.reactionChoice,
              { backgroundColor: palette.cardMuted },
              pressed && pressedStyle,
            ]}
          >
            <AppText style={styles.reactionChoiceEmoji} variant="title2">
              {emoji}
            </AppText>
          </Pressable>
        ))}
      </View>
      {mine && message.text ? (
        <ListRow
          leadingIcon="pencil"
          onPress={() => {
            onClose();
            onEdit(message);
          }}
          title={t('Modifier')}
          tone="plain"
        />
      ) : null}
      {mine ? (
        <ListRow
          leadingIcon="trash"
          leadingIconColor={palette.error}
          onPress={() => {
            onClose();
            onDelete(message);
          }}
          title={t('Supprimer pour tout le monde')}
          tone="plain"
        />
      ) : null}
    </BottomSheet>
  );
}

/** Hauteur du clavier iOS au-dessus de la zone sûre ; Android redimensionne la fenêtre lui-même. */
function useKeyboardInset(): number {
  const insets = useSafeAreaInsets();
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const subscription = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const covered = Dimensions.get('window').height - event.endCoordinates.screenY;
      setInset(Math.max(0, covered - insets.bottom));
    });
    return () => subscription.remove();
  }, [insets.bottom]);
  return inset;
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
  const { t } = useTranslation();
  const [text, setText] = useState(message.text);
  const keyboardInset = useKeyboardInset();
  const clean = text.trim();
  const canSave = Boolean(clean) && text.length <= MESSAGE_MAX_LENGTH;
  return (
    <BottomSheet onClose={onClose} visible>
      <View style={{ paddingBottom: keyboardInset }}>
        <ModalHeader
          leading={
            <DispoButton onPress={onClose} size="compact" variant="ghost">
              {t('Annuler')}
            </DispoButton>
          }
          title={t('Modifier le message')}
          trailing={
            <DispoButton
              disabled={!canSave}
              onPress={() => {
                onSave(message, clean);
                onClose();
              }}
              size="compact"
              variant="ghost"
            >
              {t('Enregistrer')}
            </DispoButton>
          }
        />
        <FormField
          autoFocus
          hint={`${text.length}/${MESSAGE_MAX_LENGTH}`}
          label={t('Ton message')}
          maxLength={MESSAGE_MAX_LENGTH}
          multiline
          onChangeText={setText}
          placeholder={t('Ton message…')}
          value={text}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  reactionChoice: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  reactionChoiceEmoji: { textAlign: 'center' },
  reactionChoices: { flexDirection: 'row', gap: spacing.xxs, justifyContent: 'space-between' },
  receipt: { height: 12, position: 'relative', width: 11 },
  receiptDouble: { width: 16 },
  receiptFirst: { left: 0, position: 'absolute', top: 0 },
  receiptSecond: { left: 4.5, position: 'absolute', top: 0 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  sheetTitle: { flex: 1 },
  typingBubble: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  typingDot: { borderRadius: radii.round, height: 7, width: 7 },
  typingRow: { alignItems: 'flex-start', width: '100%' },
});
