import { useTranslation } from 'react-i18next';

import { MessageAttachmentCard } from './message-attachments';
import { ReceiptChecks } from './message-controls';
import { receiptForMessage, type DirectMessage, type MessageReactionEmoji } from './message-model';
import { isModeratedMessage, ModeratedMessageText } from './moderated-message';

import { ChatBubble } from '@/components/ui/chat/chat-bubble';

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
  const { t } = useTranslation();
  const deleted = Boolean(message.deletedAt);
  // Message retiré par la modération : copie dédiée, ni réaction ni édition.
  const moderated = !deleted && isModeratedMessage(message);
  const inert = deleted || moderated;
  return (
    <ChatBubble
      accessibilityHint={inert ? undefined : t('Maintiens pour afficher les actions')}
      attachment={
        moderated ? (
          <ModeratedMessageText mine={mine} />
        ) : message.attachment ? (
          <MessageAttachmentCard
            attachment={message.attachment}
            isLoading={attachmentIsLoading}
            onOpen={onOpenAttachment}
          />
        ) : null
      }
      deleted={deleted}
      edited={!moderated && Boolean(message.editedAt)}
      meta={mine ? <ReceiptChecks receipt={receiptForMessage(message)} /> : null}
      mine={mine}
      onLongPress={inert ? undefined : onLongPress}
      onReactionPress={(emoji) => onReactionPress(emoji as MessageReactionEmoji)}
      reactions={
        moderated
          ? []
          : message.reactions.map((reaction) => ({
              count: reaction.count,
              emoji: reaction.emoji,
              mine: reaction.isMine,
            }))
      }
      text={moderated ? null : message.text}
      timestamp={message.createdAt}
    />
  );
}
