import type { InfiniteData } from '@tanstack/react-query';

import type { ChatMessage } from '@/domain/message';
import type { Page } from '@/domain/pagination';

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const MESSAGE_VIDEO_MAX_DURATION_MS = 2 * 60 * 1000;
export const MESSAGE_REACTION_CHOICES = ['👍', '❤️', '😂', '😮', '😢', '🙌'] as const;

export type MessageReactionEmoji = (typeof MESSAGE_REACTION_CHOICES)[number];

export interface MessageAttachment {
  byteCount: number;
  contentType: string;
  fileName: string;
  remotePath: string;
}

export interface PendingMessageAttachment {
  byteCount: number;
  contentType: string;
  fileExtension: string;
  fileName: string;
  uri: string;
}

export interface MessageReactionSummary {
  count: number;
  emoji: MessageReactionEmoji;
  isMine: boolean;
}

export interface MessageReactionRowLike {
  emoji: string;
  profileId: string;
  removedAt: string | null;
}

export interface DirectMessage extends ChatMessage {
  attachment: MessageAttachment | null;
  deliveredAt: string | null;
  reactions: MessageReactionSummary[];
}

export type DirectMessageCache = InfiniteData<Page<DirectMessage>>;

export type MessageReceipt = 'delivered' | 'read' | 'sent';

export type MessageTimelineItem =
  | { date: string; id: string; kind: 'day' }
  | { id: string; kind: 'message'; message: DirectMessage }
  | { id: 'typing'; kind: 'typing' };

export function aggregateMessageReactions(
  rows: readonly MessageReactionRowLike[],
  userId: string,
): MessageReactionSummary[] {
  return MESSAGE_REACTION_CHOICES.flatMap((emoji) => {
    const matches = rows.filter((row) => row.removedAt === null && row.emoji === emoji);
    if (matches.length === 0) return [];
    return [
      {
        count: matches.length,
        emoji,
        isMine: matches.some((row) => row.profileId === userId),
      },
    ];
  });
}

/**
 * Applies the one-reaction-per-person server rule locally while the RPC is in flight.
 * Passing null removes the current user's reaction.
 */
export function optimisticMessageReactions(
  current: readonly MessageReactionSummary[],
  nextEmoji: MessageReactionEmoji | null,
): MessageReactionSummary[] {
  const withoutMine = current.flatMap((reaction) => {
    if (!reaction.isMine) return [reaction];
    if (reaction.count <= 1) return [];
    return [{ ...reaction, count: reaction.count - 1, isMine: false }];
  });
  if (!nextEmoji) return withoutMine;

  const existingIndex = withoutMine.findIndex((reaction) => reaction.emoji === nextEmoji);
  if (existingIndex < 0) {
    return MESSAGE_REACTION_CHOICES.flatMap((emoji) => {
      if (emoji === nextEmoji) return [{ count: 1, emoji, isMine: true }];
      return withoutMine.filter((reaction) => reaction.emoji === emoji);
    });
  }
  return withoutMine.map((reaction, index) =>
    index === existingIndex ? { ...reaction, count: reaction.count + 1, isMine: true } : reaction,
  );
}

export function receiptForMessage(message: DirectMessage): MessageReceipt {
  if (message.readAt) return 'read';
  if (message.deliveredAt) return 'delivered';
  return 'sent';
}

export function patchDirectMessageCache(
  data: DirectMessageCache | undefined,
  incoming: DirectMessage,
  insertIfMissing = true,
): DirectMessageCache | undefined {
  if (!data) return data;
  let found = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((message) => {
      if (message.id !== incoming.id) return message;
      found = true;
      return {
        ...incoming,
        reactions: incoming.deletedAt ? [] : message.reactions,
      };
    }),
  }));
  if (!found && insertIfMissing && pages[0])
    pages[0] = { ...pages[0], items: [incoming, ...pages[0].items] };
  return { ...data, pages };
}

/** Keeps already-loaded conversation pages globally ordered by activity. */
export function sortConversationActivityCache<
  T extends { lastMessage: { createdAt: string } | null },
>(data: InfiniteData<Page<T>>): InfiniteData<Page<T>> {
  const sorted = data.pages
    .flatMap((page) => page.items)
    .sort(
      (left, right) =>
        new Date(right.lastMessage?.createdAt ?? 0).getTime() -
        new Date(left.lastMessage?.createdAt ?? 0).getTime(),
    );
  let offset = 0;
  return {
    ...data,
    pages: data.pages.map((page) => {
      const items = sorted.slice(offset, offset + page.items.length);
      offset += page.items.length;
      return { ...page, items };
    }),
  };
}

function calendarDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-');
}

/**
 * Messages arrive newest first for inverted-list pagination. A divider is put
 * after the oldest message of each day so it appears above that group once the
 * list is inverted.
 */
export function buildMessageTimeline(
  messages: readonly DirectMessage[],
  contactIsTyping = false,
): MessageTimelineItem[] {
  const items: MessageTimelineItem[] = contactIsTyping ? [{ id: 'typing', kind: 'typing' }] : [];
  messages.forEach((message, index) => {
    items.push({ id: `message:${message.id}`, kind: 'message', message });
    const older = messages[index + 1];
    if (!older || calendarDayKey(older.createdAt) !== calendarDayKey(message.createdAt)) {
      items.push({
        date: message.createdAt,
        id: `day:${calendarDayKey(message.createdAt)}`,
        kind: 'day',
      });
    }
  });
  return items;
}

export function messageDayLabel(
  value: string,
  now = new Date(),
  locale = 'fr',
  labels: { today: string; yesterday: string } = { today: "Aujourd'hui", yesterday: 'Hier' },
): string {
  const date = new Date(value);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (calendarDayKey(date) === calendarDayKey(now)) return labels.today;
  if (calendarDayKey(date) === calendarDayKey(yesterday)) return labels.yesterday;
  const label = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(date);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

export function messageAttachmentLabel(
  attachment: MessageAttachment | null,
  labels: { photo: string; video: string } = { photo: 'Photo', video: 'Vidéo' },
): string {
  if (!attachment) return '';
  if (attachment.contentType.startsWith('image/')) return `📷 ${labels.photo}`;
  if (attachment.contentType.startsWith('video/')) return `🎥 ${labels.video}`;
  return `📎 ${attachment.fileName}`;
}

export function relativeMessageDate(value: string, now = new Date(), locale = 'fr'): string {
  const differenceSeconds = (new Date(value).getTime() - now.getTime()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (Math.abs(differenceSeconds) < 60)
    return formatter.format(Math.round(differenceSeconds), 'second');
  const differenceMinutes = differenceSeconds / 60;
  if (Math.abs(differenceMinutes) < 60)
    return formatter.format(Math.round(differenceMinutes), 'minute');
  const differenceHours = differenceMinutes / 60;
  if (Math.abs(differenceHours) < 24) return formatter.format(Math.round(differenceHours), 'hour');
  return formatter.format(Math.round(differenceHours / 24), 'day');
}

export function formatAttachmentBytes(byteCount: number, locale = 'fr'): string {
  const unit = byteCount < 1024 ? 'byte' : byteCount < 1024 * 1024 ? 'kilobyte' : 'megabyte';
  const value =
    unit === 'byte' ? byteCount : unit === 'kilobyte' ? byteCount / 1024 : byteCount / 1024 ** 2;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: 'unit',
    unit,
    unitDisplay: 'short',
  }).format(value);
}

export function attachmentFileExtension(fileName: string, contentType: string): string {
  const supplied =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') ?? '';
  if (supplied && supplied !== fileName.toLowerCase()) return supplied.slice(0, 12);
  const known: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/heic': 'heic',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  return known[contentType.toLowerCase()] ?? 'dat';
}

export function createPendingMessageAttachment(input: {
  byteCount: number;
  contentType?: string | null;
  fileName?: string | null;
  uri: string;
}): PendingMessageAttachment {
  if (!input.uri || !Number.isFinite(input.byteCount) || input.byteCount <= 0)
    throw new Error('message_attachment_unreadable');
  if (input.byteCount > MESSAGE_ATTACHMENT_MAX_BYTES)
    throw new Error('message_attachment_too_large');
  const contentType = (input.contentType?.trim() || 'application/octet-stream').slice(0, 150);
  const rawName = input.fileName?.trim() || `Fichier.${attachmentFileExtension('', contentType)}`;
  const fileName = rawName.slice(0, 255);
  return {
    byteCount: input.byteCount,
    contentType,
    fileExtension: attachmentFileExtension(fileName, contentType),
    fileName,
    uri: input.uri,
  };
}
