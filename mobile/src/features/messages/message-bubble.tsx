import { useTranslation } from 'react-i18next';

import { MessageAttachmentCard } from './message-attachments';
import { ReceiptChecks } from './message-controls';
import { receiptForMessage, type DirectMessage, type MessageReactionEmoji } from './message-model';

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
  return (
    <ChatBubble
      accessibilityHint={deleted ? undefined : t('Maintiens pour afficher les actions')}
      attachment={
        message.attachment ? (
          <MessageAttachmentCard
            attachment={message.attachment}
            isLoading={attachmentIsLoading}
            onOpen={onOpenAttachment}
          />
        ) : null
      }
      deleted={deleted}
      edited={Boolean(message.editedAt)}
      meta={mine ? <ReceiptChecks receipt={receiptForMessage(message)} /> : null}
      mine={mine}
      onLongPress={deleted ? undefined : onLongPress}
      onReactionPress={(emoji) => onReactionPress(emoji as MessageReactionEmoji)}
      reactions={message.reactions.map((reaction) => ({
        count: reaction.count,
        emoji: reaction.emoji,
        mine: reaction.isMine,
      }))}
      text={message.text}
      timestamp={message.createdAt}
    />
  );
}
