import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';

import {
  isValidSchoolMessage,
  MusicSchool,
  NormalizedSchoolAffiliationInput,
  SchoolAffiliation,
  SchoolCommunity,
  SchoolMember,
  SchoolMessage,
  SchoolMembershipStatus,
  SchoolRole,
  SchoolVerificationLevel,
  SchoolVisibility,
} from './school-model';

import { pageRange, type Page } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';
import { uniqueRealtimeTopic } from '@/services/supabase/realtime-topic';

type SchoolRow = Pick<
  Database['public']['Tables']['music_schools']['Row'],
  | 'city'
  | 'country_code'
  | 'id'
  | 'is_verified'
  | 'logo_url'
  | 'name'
  | 'short_name'
  | 'slug'
  | 'website_url'
>;

type MySchoolRpcRow = Database['public']['Functions']['my_music_schools']['Returns'][number];
type SchoolMessageRow = Database['public']['Tables']['school_messages']['Row'];
type SchoolMessageRpcRow =
  Database['public']['Functions']['recent_school_messages']['Returns'][number];
interface SchoolMessageSender {
  id: string;
  name: string;
  photo_url: string | null;
}
interface SchoolMemberRow {
  is_primary: boolean;
  joined_at: string;
  profile_id: string;
  profiles: {
    instruments: string[];
    level: string;
    name: string;
    photo_url: string | null;
  };
  role: string;
  role_label: string | null;
  verification_level: string;
}

const schoolColumns =
  'id,slug,name,short_name,city,country_code,website_url,logo_url,is_verified' as const;
const schoolMessageColumns =
  'id,channel_id,sender_id,text,created_at,edited_at,deleted_at' as const;
const schoolMessageSenderColumns = 'id,name,photo_url' as const;

function mapSchool(row: SchoolRow): MusicSchool {
  return {
    city: row.city,
    countryCode: row.country_code,
    id: row.id,
    isVerified: row.is_verified,
    logoUrl: row.logo_url,
    name: row.name,
    shortName: row.short_name,
    slug: row.slug,
    websiteUrl: row.website_url,
  };
}

function isSchoolRole(value: string): value is SchoolRole {
  return ['student', 'teacher', 'alumni', 'staff', 'applicant', 'other'].includes(value);
}

function isSchoolVisibility(value: string): value is SchoolVisibility {
  return ['profile', 'school_only', 'private'].includes(value);
}

function isVerificationLevel(value: string): value is SchoolVerificationLevel {
  return value === 'self_declared' || value === 'verified';
}

function mapMyAffiliation(row: MySchoolRpcRow): SchoolAffiliation | null {
  if (
    !isSchoolRole(row.role) ||
    !isSchoolVisibility(row.visibility) ||
    !isVerificationLevel(row.verification_level)
  ) {
    return null;
  }
  return {
    id: row.membership_id,
    isPrimary: row.is_primary,
    joinedAt: row.joined_at,
    memberCount: row.member_count,
    role: row.role,
    roleLabel: row.role_label || null,
    school: {
      city: row.city,
      countryCode: row.country_code,
      id: row.school_id,
      isVerified: row.is_verified,
      logoUrl: row.logo_url || null,
      name: row.name,
      shortName: row.short_name || null,
      slug: row.slug,
      websiteUrl: null,
    },
    status: 'active' satisfies SchoolMembershipStatus,
    verificationLevel: row.verification_level,
    visibility: row.visibility,
  };
}

function mapSchoolMessage(
  row: SchoolMessageRow | SchoolMessageRpcRow,
  senders: ReadonlyMap<string, SchoolMessageSender>,
): SchoolMessage {
  const sender = senders.get(row.sender_id);
  return {
    channelId: row.channel_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    editedAt: row.edited_at,
    id: row.id,
    senderId: row.sender_id,
    senderName: sender?.name || 'Membre',
    senderPhotoUrl: sender?.photo_url || null,
    text: row.deleted_at ? '' : row.text,
  };
}

async function fetchSchoolMessageSenders(
  senderIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, SchoolMessageSender>> {
  const ids = [...new Set(senderIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const query = getSupabaseClient()
        .from('profiles')
        .select(schoolMessageSenderColumns)
        .in('id', chunk);
      const result = await (signal ? query.abortSignal(signal) : query);
      if (result.error) throw result.error;
      return result.data as SchoolMessageSender[];
    }),
  );
  return new Map(results.flat().map((sender) => [sender.id, sender]));
}

function mapMember(row: SchoolMemberRow): SchoolMember | null {
  if (!isSchoolRole(row.role) || !isVerificationLevel(row.verification_level)) return null;
  return {
    instruments: row.profiles.instruments,
    isPrimary: row.is_primary,
    joinedAt: row.joined_at,
    level: row.profiles.level,
    name: row.profiles.name,
    photoUrl: row.profiles.photo_url || null,
    profileId: row.profile_id,
    role: row.role,
    roleLabel: row.role_label || null,
    verificationLevel: row.verification_level,
  };
}

export async function fetchSchoolsPage(
  page: number,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<MusicSchool>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('music_schools')
    .select(schoolColumns)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize) as SchoolRow[];
  return {
    items: rows.map(mapSchool),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function fetchSchool(
  schoolId: string,
  signal?: AbortSignal,
): Promise<MusicSchool | null> {
  const query = getSupabaseClient()
    .from('music_schools')
    .select(schoolColumns)
    .eq('id', schoolId)
    .eq('is_active', true);
  const abortable = signal ? query.abortSignal(signal) : query;
  const result = await abortable.maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapSchool(result.data as SchoolRow) : null;
}

export async function fetchMySchoolAffiliations(
  signal?: AbortSignal,
): Promise<SchoolAffiliation[]> {
  const query = getSupabaseClient().rpc('my_music_schools');
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return result.data.flatMap((row) => {
    const affiliation = mapMyAffiliation(row);
    return affiliation ? [affiliation] : [];
  });
}

export async function fetchSchoolCommunities(signal?: AbortSignal): Promise<SchoolCommunity[]> {
  const supabase = getSupabaseClient();
  const affiliationsQuery = supabase.rpc('my_music_schools');
  const messagesQuery = supabase.rpc('recent_school_messages', { p_limit: 60 });
  const [affiliationsResult, messagesResult] = await Promise.all([
    signal ? affiliationsQuery.abortSignal(signal) : affiliationsQuery,
    signal ? messagesQuery.abortSignal(signal) : messagesQuery,
  ]);
  if (affiliationsResult.error) throw affiliationsResult.error;
  if (messagesResult.error) throw messagesResult.error;
  const rows = messagesResult.data as SchoolMessageRpcRow[];
  const senders = await fetchSchoolMessageSenders(
    rows.map((row) => row.sender_id),
    signal,
  );
  const messagesByChannel = new Map<string, SchoolMessage[]>();
  for (const row of rows) {
    const messages = messagesByChannel.get(row.channel_id) ?? [];
    messages.push(mapSchoolMessage(row, senders));
    messagesByChannel.set(row.channel_id, messages);
  }
  return affiliationsResult.data.flatMap((row) => {
    const affiliation = mapMyAffiliation(row);
    if (!affiliation || !row.channel_id) return [];
    return [
      {
        affiliation,
        channelId: row.channel_id,
        messages: messagesByChannel.get(row.channel_id) ?? [],
      },
    ];
  });
}

export async function fetchSchoolMessagesPage(
  channelId: string,
  page: number,
  pageSize = 40,
  signal?: AbortSignal,
): Promise<Page<SchoolMessage>> {
  if (!channelId) return { items: [], nextPage: null };
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('school_messages')
    .select(schoolMessageColumns)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const allRows = result.data as SchoolMessageRow[];
  const rows = allRows.slice(0, pageSize);
  const senders = await fetchSchoolMessageSenders(
    rows.map((row) => row.sender_id),
    signal,
  );
  return {
    items: rows.map((row) => mapSchoolMessage(row, senders)),
    nextPage: allRows.length > pageSize ? page + 1 : null,
  };
}

export async function sendSchoolMessage(
  channelId: string,
  text: string,
  sender: { id: string; name?: string | null; photoUrl?: string | null },
): Promise<SchoolMessage> {
  if (!channelId || !sender.id) throw new Error('school_message_session_required');
  if (!isValidSchoolMessage(text)) throw new Error('school_message_invalid');
  const result = await getSupabaseClient().rpc('send_school_message', {
    p_channel_id: channelId,
    p_text: text.trim(),
  });
  if (result.error) throw result.error;
  return mapSchoolMessage(
    result.data,
    new Map([
      [
        sender.id,
        { id: sender.id, name: sender.name || 'Membre', photo_url: sender.photoUrl ?? null },
      ],
    ]),
  );
}

export async function editSchoolMessage(messageId: string, text: string): Promise<void> {
  if (!messageId || !isValidSchoolMessage(text)) throw new Error('school_message_invalid');
  const result = await getSupabaseClient().rpc('edit_school_message', {
    p_message_id: messageId,
    p_text: text.trim(),
  });
  if (result.error) throw result.error;
}

export async function deleteSchoolMessage(messageId: string): Promise<void> {
  const result = await getSupabaseClient().rpc('delete_school_message', {
    p_message_id: messageId,
  });
  if (result.error) throw result.error;
}

export async function reportSchoolMessage(
  userId: string,
  message: Pick<SchoolMessage, 'id' | 'senderId'>,
): Promise<void> {
  if (!userId || !message.id || message.senderId === userId)
    throw new Error('school_report_invalid');
  const result = await getSupabaseClient().from('reports').insert({
    reason: "Message d'école inapproprié",
    reported_id: message.senderId,
    reporter_id: userId,
    school_message_id: message.id,
  });
  if (result.error) throw result.error;
}

export async function blockSchoolMember(userId: string, profileId: string): Promise<void> {
  if (!userId || !profileId || userId === profileId) throw new Error('school_block_invalid');
  const result = await getSupabaseClient()
    .from('blocks')
    .upsert({ blocked_id: profileId, blocker_id: userId });
  if (result.error) throw result.error;
}

export async function fetchSchoolMembersPage(
  schoolId: string,
  page: number,
  pageSize = 30,
  signal?: AbortSignal,
): Promise<Page<SchoolMember>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('music_school_memberships')
    .select(
      'profile_id,role,role_label,verification_level,is_primary,joined_at,profiles!inner(name,photo_url,instruments,level)',
    )
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .order('name', { ascending: true, referencedTable: 'profiles' })
    .order('profile_id', { ascending: true })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = (result.data as unknown as SchoolMemberRow[]).slice(0, pageSize);
  return {
    items: rows.flatMap((row) => {
      const member = mapMember(row);
      return member ? [member] : [];
    }),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function saveSchoolAffiliation(
  input: NormalizedSchoolAffiliationInput,
): Promise<void> {
  const params: Database['public']['Functions']['join_music_school']['Args'] = {
    p_role: input.role,
    p_school_id: input.schoolId,
    p_visibility: input.visibility,
    ...(input.roleLabel ? { p_role_label: input.roleLabel } : {}),
  };
  const result = await getSupabaseClient().rpc('join_music_school', params);
  if (result.error) throw result.error;
}

export async function leaveSchool(schoolId: string): Promise<boolean> {
  const result = await getSupabaseClient().rpc('leave_music_school', { p_school_id: schoolId });
  if (result.error) throw result.error;
  return result.data;
}

export function subscribeToSchoolCommunities(
  channelIds: readonly string[],
  schoolIds: readonly string[],
  userId: string,
  onMessage: (row: SchoolMessageRow, event: 'insert' | 'update') => void,
  onMembershipChange: () => void,
): () => void {
  const ids = [...new Set(channelIds.filter(Boolean))].sort();
  const membershipSchoolIds = [...new Set(schoolIds.filter(Boolean))].sort();
  if (!userId) return () => undefined;
  const supabase = getSupabaseClient();
  let channel = supabase.channel(uniqueRealtimeTopic(`school-communities:${userId}`)).on(
    'postgres_changes',
    {
      event: '*',
      filter: `profile_id=eq.${userId}`,
      schema: 'public',
      table: 'music_school_memberships',
    },
    onMembershipChange,
  );
  if (ids.length > 0) {
    const channelFilter =
      ids.length === 1 ? `channel_id=eq.${ids[0]}` : `channel_id=in.(${ids.join(',')})`;
    const schoolFilter =
      membershipSchoolIds.length === 1
        ? `school_id=eq.${membershipSchoolIds[0]}`
        : `school_id=in.(${membershipSchoolIds.join(',')})`;
    channel = channel
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: schoolFilter,
          schema: 'public',
          table: 'music_school_memberships',
        },
        onMembershipChange,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', filter: channelFilter, schema: 'public', table: 'school_messages' },
        (payload: RealtimePostgresInsertPayload<SchoolMessageRow>) =>
          onMessage(payload.new, 'insert'),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', filter: channelFilter, schema: 'public', table: 'school_messages' },
        (payload: RealtimePostgresUpdatePayload<SchoolMessageRow>) =>
          onMessage(payload.new, 'update'),
      );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToSchoolMessages(
  channelId: string,
  onChange: (row: SchoolMessageRow, event: 'insert' | 'update') => void,
): () => void {
  if (!channelId) return () => undefined;
  const supabase = getSupabaseClient();
  const filter = `channel_id=eq.${channelId}`;
  const channel = supabase
    .channel(uniqueRealtimeTopic(`school-messages:${channelId}`))
    .on(
      'postgres_changes',
      { event: 'INSERT', filter, schema: 'public', table: 'school_messages' },
      (payload: RealtimePostgresInsertPayload<SchoolMessageRow>) => onChange(payload.new, 'insert'),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', filter, schema: 'public', table: 'school_messages' },
      (payload: RealtimePostgresUpdatePayload<SchoolMessageRow>) => onChange(payload.new, 'update'),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
