import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { messageAttachmentLabel, relativeMessageDate } from './message-model';
import type { ConversationSummary } from './message-repository';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, radii, spacing, typography } from '@/theme/tokens';

export function ConversationCard({
  conversation,
  onPress,
}: {
  conversation: ConversationSummary;
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const contactName = conversation.contactName || t('Musicien');
  const contactInstrument = conversation.contactInstrument
    ? t(conversation.contactInstrument)
    : t('Instrument à préciser');
  const unread = conversation.unreadCount > 0;
  const last = conversation.lastMessage;
  const preview = last?.deletedAt
    ? t('Message supprimé')
    : last?.text ||
      messageAttachmentLabel(last?.attachment ?? null, {
        photo: t('Photo'),
        video: t('Vidéo'),
      }) ||
      t('Commence la conversation');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={13}>
        <View style={styles.row}>
          <Avatar name={contactName} size={50} uri={conversation.contactPhotoUrl} />
          <View style={styles.content}>
            <View style={styles.heading}>
              <AppText
                numberOfLines={1}
                style={[styles.name, unread && styles.unreadName]}
                variant="subheadline"
              >
                {contactName}
              </AppText>
              {last ? (
                <AppText
                  color={unread ? palette.electric : palette.muted}
                  numberOfLines={1}
                  variant="caption2"
                >
                  {relativeMessageDate(last.createdAt, new Date(), locale)}
                </AppText>
              ) : null}
            </View>
            <AppText color={palette.electric} style={styles.instrument} variant="caption2">
              {contactInstrument}
            </AppText>
            <AppText
              color={unread ? palette.text : palette.muted}
              numberOfLines={1}
              style={unread && styles.unreadPreview}
              variant="caption"
            >
              {conversation.lastMessageIsMine && last ? `${t('Toi')} : ` : ''}
              {preview}
            </AppText>
          </View>
          {unread ? (
            <LinearGradient
              accessibilityLabel={`${conversation.unreadCount} ${t('messages non lus')}`}
              colors={gradients.hero}
              style={[styles.unread, conversation.unreadCount > 9 && styles.unreadWide]}
            >
              <AppText color={billetInk} style={styles.unreadText} variant="caption2">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </AppText>
            </LinearGradient>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 3 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  instrument: { fontWeight: '700' },
  name: { flex: 1, fontWeight: '700' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  unread: {
    alignItems: 'center',
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 22,
  },
  unreadName: { fontWeight: '900' },
  unreadPreview: { fontWeight: '600' },
  unreadText: { fontFamily: typography.monoSemibold, fontWeight: '800' },
  unreadWide: { paddingHorizontal: 5 },
});
