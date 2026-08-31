import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';

import {
  aggregateMessageReactions,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_MAX_LENGTH,
  type DirectMessage,
  type MessageAttachment,
  type MessageReactionRowLike,
  type MessageReactionSummary,
  type PendingMessageAttachment,
} from './message-model';

import { pageRange, type Page } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ConversationRow = Database['public']['Tables']['conversations']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type ReactionRow = Database['public']['Tables']['message_reactions']['Row'];
type ReactionProjection = Pick<ReactionRow, 'emoji' | 'message_id' | 'profile_id' | 'removed_at'>;
type MessageProjection = Pick<
  MessageRow,
  | 'attachment_name'
  | 'attachment_path'
  | 'attachment_size'
  | 'attachment_type'
  | 'conversation_id'
  | 'created_at'
  | 'deleted_at'
  | 'delivered_at'
  | 'edited_at'
  | 'id'
  | 'read_at'
  | 'sender_id'
  | 'text'
>;
type ConversationProjection = Pick<
  ConversationRow,
  'created_at' | 'id' | 'participant_a' | 'participant_b'
> & {
  messages: MessageProjection[];
};

export interface ConversationSummary {
  contactId: string;
  contactInstrument: string;
  contactName: string;
  contactPhotoUrl: string | null;
  id: string;
  lastMessage: DirectMessage | null;
  lastMessageIsMine: boolean;
  unreadCount: number;
}

export interface ConversationContact {
  id: string;
  instrument: string;
  name: string;
  photoUrl: string | null;
}

export interface SendMessageInput {
  attachment: PendingMessageAttachment | null;
  text: string;
}

const messageFilesBucket = 'message-files';
const messageColumns =
  'id,conversation_id,sender_id,text,created_at,delivered_at,read_at,edited_at,deleted_at,attachment_path,attachment_name,attachment_type,attachment_size' as const;
const conversationColumns =
  'id,participant_a,participant_b,created_at,messages(id,conversation_id,sender_id,text,created_at,delivered_at,read_at,edited_at,deleted_at,attachment_path,attachment_name,attachment_type,attachment_size)' as const;
const reactionColumns = 'message_id,profile_id,emoji,removed_at' as const;

function mapAttachment(row: MessageProjection): MessageAttachment | null {
  if (
    !row.attachment_path ||
    !row.attachment_name ||
    !row.attachment_type ||
    row.attachment_size === null
  )
    return null;
  return {
    byteCount: row.attachment_size,
    contentType: row.attachment_type,
    fileName: row.attachment_name,
    remotePath: row.attachment_path,
  };
}

function mapMessage(
  row: MessageProjection,
  reactions: MessageReactionSummary[] = [],
): DirectMessage {
  return {
    attachment: mapAttachment(row),
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    deliveredAt: row.delivered_at,
    editedAt: row.edited_at,
    id: row.id,
    reactions,
    readAt: row.read_at,
    senderId: row.sender_id,
    text: row.text,
  };
}

function reactionRowsForModel(rows: readonly ReactionProjection[]): MessageReactionRowLike[] {
  return rows.map((row) => ({
    emoji: row.emoji,
    profileId: row.profile_id,
    removedAt: row.removed_at,
  }));
}

export async function fetchConversationsPage(
  userId: string,
  page: number,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<ConversationSummary>> {
  const { from, to } = pageRange(page, pageSize);
  const supabase = getSupabaseClient();
  const conversationQuery = supabase
    .from('conversations')
    .select(conversationColumns)
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .order('created_at', { ascending: false, referencedTable: 'messages' })
    .order('id', { ascending: false, referencedTable: 'messages' })
    .limit(1, { referencedTable: 'messages' })
    .range(from, to + 1);
  const conversationResult = await (signal
    ? conversationQuery.abortSignal(signal)
    : conversationQuery);
  if (conversationResult.error) throw conversationResult.error;
  const allConversations = conversationResult.data as ConversationProjection[];
  const conversations = allConversations.slice(0, pageSize);
  if (conversations.length === 0) return { items: [], nextPage: null };

  const contactIds = [
    ...new Set(
      conversations.map((conversation) =>
        conversation.participant_a === userId
          ? conversation.participant_b
          : conversation.participant_a,
      ),
    ),
  ];
  const profileQuery = supabase
    .from('profiles')
    .select('id,name,photo_url,instruments')
    .in('id', contactIds);
  const profileResult = await (signal ? profileQuery.abortSignal(signal) : profileQuery);
  if (profileResult.error) throw profileResult.error;
  const profiles = new Map(profileResult.data.map((profile) => [profile.id, profile]));
  const unreadQuery = supabase
    .from('messages')
    .select('conversation_id')
    .in(
      'conversation_id',
      conversations.map((conversation) => conversation.id),
    )
    .neq('sender_id', userId)
    .is('read_at', null)
    .is('deleted_at', null);
  const unreadResult = await (signal ? unreadQuery.abortSignal(signal) : unreadQuery);
  if (unreadResult.error) throw unreadResult.error;
  const unreadByConversation = new Map<string, number>();
  for (const row of unreadResult.data) {
    unreadByConversation.set(
      row.conversation_id,
      (unreadByConversation.get(row.conversation_id) ?? 0) + 1,
    );
  }

  const items = conversations.map((conversation) => {
    const contactId =
      conversation.participant_a === userId
        ? conversation.participant_b
        : conversation.participant_a;
    const contact = profiles.get(contactId);
    return {
      contactId,
      contactInstrument: contact?.instruments[0] ?? '',
      contactName: contact?.name ?? '',
      contactPhotoUrl: contact?.photo_url ?? null,
      id: conversation.id,
      lastMessage: conversation.messages[0] ? mapMessage(conversation.messages[0]) : null,
      lastMessageIsMine: conversation.messages[0]?.sender_id === userId,
      unreadCount: unreadByConversation.get(conversation.id) ?? 0,
    };
  });
  items.sort(
    (left, right) =>
      new Date(right.lastMessage?.createdAt ?? 0).getTime() -
      new Date(left.lastMessage?.createdAt ?? 0).getTime(),
  );
  return {
    items,
    nextPage: allConversations.length > pageSize ? page + 1 : null,
  };
}

export async function fetchMessageReactions(
  messageId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<MessageReactionSummary[]> {
  const query = getSupabaseClient()
    .from('message_reactions')
    .select(reactionColumns)
    .eq('message_id', messageId)
    .is('removed_at', null);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return aggregateMessageReactions(reactionRowsForModel(result.data), userId);
}

export async function fetchConversationContact(
  conversationId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<ConversationContact> {
  const supabase = getSupabaseClient();
  const conversationQuery = supabase
    .from('conversations')
    .select('participant_a,participant_b')
    .eq('id', conversationId);
  const conversationResult = await (
    signal ? conversationQuery.abortSignal(signal) : conversationQuery
  ).single();
  if (conversationResult.error) throw conversationResult.error;
  const contactId =
    conversationResult.data.participant_a === userId
      ? conversationResult.data.participant_b
      : conversationResult.data.participant_a;
  const profileQuery = supabase
    .from('profiles')
    .select('id,name,photo_url,instruments')
    .eq('id', contactId);
  const profileResult = await (signal ? profileQuery.abortSignal(signal) : profileQuery).single();
  if (profileResult.error) throw profileResult.error;
  return {
    id: profileResult.data.id,
    instrument: profileResult.data.instruments[0] ?? '',
    name: profileResult.data.name || '',
    photoUrl: profileResult.data.photo_url,
  };
}

export async function fetchMessagesPage(
  conversationId: string,
  userId: string,
  page: number,
  pageSize = 40,
  signal?: AbortSignal,
): Promise<Page<DirectMessage>> {
  const { from, to } = pageRange(page, pageSize);
  const supabase = getSupabaseClient();
  const query = supabase
    .from('messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize);
  const messageIds = rows.map((row) => row.id);
  let reactionRows: ReactionProjection[] = [];
  if (messageIds.length > 0) {
    const reactionQuery = supabase
      .from('message_reactions')
      .select(reactionColumns)
      .in('message_id', messageIds)
      .is('removed_at', null);
    const reactionResult = await (signal ? reactionQuery.abortSignal(signal) : reactionQuery);
    if (reactionResult.error) throw reactionResult.error;
    reactionRows = reactionResult.data;
  }
  const reactionsByMessage = new Map<string, ReactionProjection[]>();
  for (const row of reactionRows) {
    const existing = reactionsByMessage.get(row.message_id) ?? [];
    existing.push(row);
    reactionsByMessage.set(row.message_id, existing);
  }
  return {
    items: rows.map((row) =>
      mapMessage(
        row,
        aggregateMessageReactions(
          reactionRowsForModel(reactionsByMessage.get(row.id) ?? []),
          userId,
        ),
      ),
    ),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

async function discardUploadedAttachment(path: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.rpc('queue_message_file_cleanup', { p_path: path });
  const removal = await supabase.storage.from(messageFilesBucket).remove([path]);
  if (!removal.error) await supabase.rpc('complete_message_file_cleanup', { p_path: path });
}

async function uploadMessageAttachment(
  conversationId: string,
  senderId: string,
  pending: PendingMessageAttachment,
): Promise<MessageAttachment> {
  const localFile = new File(pending.uri);
  const data = await localFile.arrayBuffer();
  if (data.byteLength <= 0) throw new Error('message_attachment_unreadable');
  if (data.byteLength > MESSAGE_ATTACHMENT_MAX_BYTES)
    throw new Error('message_attachment_too_large');
  const extension =
    pending.fileExtension
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 12) || 'dat';
  const path = `conversation/${conversationId.toLowerCase()}/${senderId.toLowerCase()}/${randomUUID().toLowerCase()}.${extension}`;
  const upload = await getSupabaseClient()
    .storage.from(messageFilesBucket)
    .upload(path, data, { contentType: pending.contentType, upsert: false });
  if (upload.error) throw upload.error;
  return {
    byteCount: data.byteLength,
    contentType: pending.contentType,
    fileName: pending.fileName.slice(0, 255),
    remotePath: path,
  };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  input: SendMessageInput,
): Promise<DirectMessage> {
  if (!conversationId || !senderId) throw new Error('message_session_required');
  const text = input.text.trim();
  if (text.length > MESSAGE_MAX_LENGTH || (!text && !input.attachment))
    throw new Error('message_invalid');

  const uploaded = input.attachment
    ? await uploadMessageAttachment(conversationId, senderId, input.attachment)
    : null;
  const result = await getSupabaseClient()
    .from('messages')
    .insert({
      attachment_name: uploaded?.fileName ?? null,
      attachment_path: uploaded?.remotePath ?? null,
      attachment_size: uploaded?.byteCount ?? null,
      attachment_type: uploaded?.contentType ?? null,
      conversation_id: conversationId,
      sender_id: senderId,
      text,
    })
    .select(messageColumns)
    .single();
  if (result.error) {
    if (uploaded) await discardUploadedAttachment(uploaded.remotePath).catch(() => undefined);
    throw result.error;
  }
  return mapMessage(result.data);
}

export async function editMessage(messageId: string, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean || clean.length > MESSAGE_MAX_LENGTH) throw new Error('message_invalid');
  const result = await getSupabaseClient().rpc('edit_message', {
    p_message: messageId,
    p_text: clean,
  });
  if (result.error) throw result.error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const result = await supabase.rpc('delete_message', { p_message: messageId });
  if (result.error) throw result.error;
  const path = result.data || null;
  if (!path) return;
  const removal = await supabase.storage.from(messageFilesBucket).remove([path]);
  if (!removal.error) await supabase.rpc('complete_message_file_cleanup', { p_path: path });
}

export async function setMessageReaction(messageId: string, emoji: string | null): Promise<void> {
  // The SQL function intentionally accepts NULL to remove a reaction; the
  // generated type still reflects the older non-null signature.
  const params = {
    p_emoji: emoji,
    p_message: messageId,
  } as unknown as Database['public']['Functions']['set_message_reaction']['Args'];
  const result = await getSupabaseClient().rpc('set_message_reaction', params);
  if (result.error) throw result.error;
}

export async function markMessagesDelivered(): Promise<void> {
  const result = await getSupabaseClient().rpc('mark_messages_delivered');
  if (result.error) throw result.error;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const result = await getSupabaseClient().rpc('mark_conversation_read', {
    conv_id: conversationId,
  });
  if (result.error) throw result.error;
}

export async function openMessageAttachment(attachment: MessageAttachment): Promise<void> {
  const storage = getSupabaseClient().storage.from(messageFilesBucket);
  const signed = await storage.createSignedUrl(attachment.remotePath, 60);
  if (signed.error) throw signed.error;
  // Keep consultation inside the app, like Swift's Quick Look sheet. The
  // private object remains protected by a short-lived signed URL.
  await WebBrowser.openBrowserAsync(signed.data.signedUrl);
}

export async function ensureDirectConversation(userId: string, contactId: string): Promise<string> {
  if (!userId || !contactId || userId === contactId)
    throw new Error('conversation_participants_invalid');
  const [participantA, participantB] = [userId, contactId].sort();
  if (!participantA || !participantB) throw new Error('conversation_participants_invalid');
  const supabase = getSupabaseClient();
  const existing = await supabase
    .from('conversations')
    .select('id')
    .eq('participant_a', participantA)
    .eq('participant_b', participantB)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const inserted = await supabase
    .from('conversations')
    .insert({ participant_a: participantA, participant_b: participantB })
    .select('id')
    .single();
  if (!inserted.error) return inserted.data.id;

  const raced = await supabase
    .from('conversations')
    .select('id')
    .eq('participant_a', participantA)
    .eq('participant_b', participantB)
    .single();
  if (raced.error) throw inserted.error;
  return raced.data.id;
}

export function subscribeToConversation(
  conversationId: string,
  onMessage: (message: DirectMessage, event: 'insert' | 'update') => void,
  onReaction: (messageId: string) => void,
) {
  const supabase = getSupabaseClient();
  const handleInsert = (payload: RealtimePostgresInsertPayload<MessageRow>) =>
    onMessage(mapMessage(payload.new), 'insert');
  const handleUpdate = (payload: RealtimePostgresUpdatePayload<MessageRow>) =>
    onMessage(mapMessage(payload.new), 'update');
  const handleReaction = (
    payload:
      RealtimePostgresInsertPayload<ReactionRow> | RealtimePostgresUpdatePayload<ReactionRow>,
  ) => onReaction(payload.new.message_id);
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      handleInsert,
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      handleUpdate,
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_reactions' },
      handleReaction,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'message_reactions' },
      handleReaction,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Global inbox stream used while the conversation list is visible. */
export function subscribeToInbox(userId: string, onMessage: (message: DirectMessage) => void) {
  const supabase = getSupabaseClient();
  const handleMessage = (
    payload: RealtimePostgresInsertPayload<MessageRow> | RealtimePostgresUpdatePayload<MessageRow>,
  ) => onMessage(mapMessage(payload.new));
  const channel = supabase
    .channel(`messages-inbox:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleMessage)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, handleMessage)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export interface TypingChannelController {
  send: () => void;
  unsubscribe: () => void;
}

export function subscribeToTyping(
  conversationId: string,
  userId: string,
  onContactTyping: () => void,
): TypingChannelController {
  const supabase = getSupabaseClient();
  let subscribed = false;
  const channel = supabase
    .channel(`typing-${conversationId}`)
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (
        payload &&
        typeof payload === 'object' &&
        'user_id' in payload &&
        payload.user_id !== userId
      )
        onContactTyping();
    })
    .subscribe((status) => {
      subscribed = status === 'SUBSCRIBED';
    });
  return {
    send: () => {
      if (!subscribed) return;
      void channel.send({
        event: 'typing',
        payload: { user_id: userId },
        type: 'broadcast',
      });
    },
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
