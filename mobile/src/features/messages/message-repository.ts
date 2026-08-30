import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';

import type { ChatMessage } from '@/domain/message';
import { newMessagePayload } from '@/domain/message';
import { pageRange, type Page } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ConversationRow = Database['public']['Tables']['conversations']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type MessageProjection = Pick<
  MessageRow,
  | 'conversation_id'
  | 'created_at'
  | 'deleted_at'
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
  lastMessage: ChatMessage | null;
}

function mapMessage(row: MessageProjection): ChatMessage {
  return {
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    editedAt: row.edited_at,
    id: row.id,
    readAt: row.read_at,
    senderId: row.sender_id,
    text: row.text,
  };
}

const messageColumns =
  'id,conversation_id,sender_id,text,created_at,edited_at,deleted_at,read_at' as const;
const conversationColumns =
  'id,participant_a,participant_b,created_at,messages(id,conversation_id,sender_id,text,created_at,edited_at,deleted_at,read_at)' as const;

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

  return {
    items: conversations.map((conversation) => {
      const contactId =
        conversation.participant_a === userId
          ? conversation.participant_b
          : conversation.participant_a;
      const contact = profiles.get(contactId);
      return {
        contactId,
        contactInstrument: contact?.instruments[0] ?? 'Voix',
        contactName: contact?.name ?? 'Musicien',
        contactPhotoUrl: contact?.photo_url ?? null,
        id: conversation.id,
        lastMessage: conversation.messages[0] ? mapMessage(conversation.messages[0]) : null,
      };
    }),
    nextPage: allConversations.length > pageSize ? page + 1 : null,
  };
}

export async function fetchMessagesPage(
  conversationId: string,
  page: number,
  pageSize = 40,
  signal?: AbortSignal,
): Promise<Page<ChatMessage>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return {
    items: result.data.slice(0, pageSize).map(mapMessage),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
): Promise<ChatMessage> {
  if (!conversationId || !senderId) throw new Error('message_session_required');
  const result = await getSupabaseClient()
    .from('messages')
    .insert(newMessagePayload(conversationId, senderId, text))
    .select(messageColumns)
    .single();
  if (result.error) throw result.error;
  return mapMessage(result.data);
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
  onMessage: (message: ChatMessage) => void,
) {
  const supabase = getSupabaseClient();
  const handleChange = (
    payload: RealtimePostgresInsertPayload<MessageRow> | RealtimePostgresUpdatePayload<MessageRow>,
  ) => onMessage(mapMessage(payload.new));
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
      handleChange,
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      handleChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
