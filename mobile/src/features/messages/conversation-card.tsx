import { useTranslation } from 'react-i18next';

import { messageAttachmentLabel, relativeMessageDate } from './message-model';
import type { ConversationSummary } from './message-repository';

import { Avatar } from '@/components/ui/avatar';
import { ConversationRow } from '@/components/ui/chat/conversation-row';

export function ConversationCard({
  conversation,
  onPress,
}: {
  conversation: ConversationSummary;
  onPress: () => void;
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const contactName = conversation.contactName || t('Musicien');
  const contactInstrument = conversation.contactInstrument
    ? t(conversation.contactInstrument)
    : t('Instrument à préciser');
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
    <ConversationRow
      leading={<Avatar name={contactName} size={50} uri={conversation.contactPhotoUrl} />}
      meta={last ? relativeMessageDate(last.createdAt, new Date(), locale) : undefined}
      onPress={onPress}
      preview={`${conversation.lastMessageIsMine && last ? `${t('Toi')} : ` : ''}${preview}`}
      subtitle={contactInstrument}
      title={contactName}
      unreadCount={conversation.unreadCount}
    />
  );
}
