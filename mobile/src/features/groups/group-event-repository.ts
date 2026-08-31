import type { GigDetail } from '../gigs/gig-model';
import { fetchGig } from '../gigs/gig-repository';
import { ensureDirectConversation, sendMessage } from '../messages/message-repository';

import i18n from '@/i18n';
import { getSupabaseClient } from '@/services/supabase/client';

export interface GroupEventGuest {
  eventId: string;
  gigId: string;
  groupId: string;
  instrument: string | null;
  musicianId: string;
  name: string;
  photoUrl: string | null;
}

export interface GroupEventAvailableInvitee {
  availableDates: string[];
  id: string;
  instruments: string[];
  name: string;
  photoUrl: string | null;
}

export interface GroupEventResources {
  availableInvitees: GroupEventAvailableInvitee[];
  guests: GroupEventGuest[];
  linkedGigs: GigDetail[];
}

export interface InviteAvailableToEventInput {
  eventId: string;
  groupId: string;
  invitedBy: string;
  message: string;
  profileId: string;
}

export interface InviteAvailableToEventResult {
  attendancePrefilled: boolean;
  messageSent: boolean;
}

/** Jour civil local, identique au calendrier de disponibilité Swift. */
export function groupEventDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function fetchEventGuests(eventId: string, signal?: AbortSignal): Promise<GroupEventGuest[]> {
  const query = getSupabaseClient().rpc('my_event_guests').eq('event_id', eventId);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return result.data
    .map((row) => ({
      eventId: row.event_id,
      gigId: row.gig_id,
      groupId: row.group_id,
      instrument: row.instrument || null,
      musicianId: row.musician_id,
      name: row.name || i18n.t('Invité·e'),
      photoUrl: row.photo_url || null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function fetchLinkedEventGigs(
  eventId: string,
  userId: string,
  includeLeaderData: boolean,
  signal?: AbortSignal,
): Promise<GigDetail[]> {
  if (!includeLeaderData) return [];
  const query = getSupabaseClient()
    .from('gig_requests_feed')
    .select('id,host_id')
    .eq('event_id', eventId)
    .eq('host_id', userId)
    .order('date')
    .limit(20);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const ids = result.data.flatMap((row) => (row.id ? [row.id] : []));
  return Promise.all(ids.map((id) => fetchGig(id, userId, signal)));
}

async function fetchAvailableInvitees(
  eventDate: string,
  excludedProfileIds: readonly string[],
  includeLeaderData: boolean,
  signal?: AbortSignal,
): Promise<GroupEventAvailableInvitee[]> {
  const day = groupEventDayKey(eventDate);
  if (!includeLeaderData || !day) return [];
  const query = getSupabaseClient()
    .from('profiles')
    .select('id,name,photo_url,instruments,available_dates')
    .contains('available_dates', [day])
    .neq('name', '')
    .order('name')
    .limit(50);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const excluded = new Set(excludedProfileIds);
  return result.data
    .filter((profile) => !excluded.has(profile.id))
    .map((profile) => ({
      availableDates: profile.available_dates,
      id: profile.id,
      instruments: profile.instruments,
      name: profile.name || i18n.t('Musicien·ne'),
      photoUrl: profile.photo_url,
    }))
    .slice(0, 20);
}

export async function fetchGroupEventResources(input: {
  eventDate: string;
  eventId: string;
  excludedProfileIds: readonly string[];
  includeLeaderData: boolean;
  signal?: AbortSignal;
  userId: string;
}): Promise<GroupEventResources> {
  const [availableInvitees, guests, linkedGigs] = await Promise.all([
    fetchAvailableInvitees(
      input.eventDate,
      input.excludedProfileIds,
      input.includeLeaderData,
      input.signal,
    ),
    fetchEventGuests(input.eventId, input.signal),
    fetchLinkedEventGigs(input.eventId, input.userId, input.includeLeaderData, input.signal),
  ]);
  return { availableInvitees, guests, linkedGigs };
}

/**
 * Reproduit l'invitation Swift : invitation comme membre invité, présence
 * pré-cochée pour cette date et message direct. L'invitation est l'action
 * autoritative ; les deux aides suivantes restent best-effort.
 */
export async function inviteAvailableToGroupEvent(
  input: InviteAvailableToEventInput,
): Promise<InviteAvailableToEventResult> {
  const supabase = getSupabaseClient();
  const invitation = await supabase.from('group_invitations').insert({
    group_id: input.groupId,
    invited_by: input.invitedBy,
    kind: 'guest',
    profile_id: input.profileId,
  });
  if (invitation.error) throw invitation.error;

  const attendance = await supabase.from('event_attendance').upsert(
    {
      event_id: input.eventId,
      profile_id: input.profileId,
      responded_at: new Date().toISOString(),
      status: 'available',
    },
    { onConflict: 'event_id,profile_id' },
  );

  let messageSent = false;
  try {
    const conversationId = await ensureDirectConversation(input.invitedBy, input.profileId);
    await sendMessage(conversationId, input.invitedBy, {
      attachment: null,
      text: input.message,
    });
    messageSent = true;
  } catch {
    // L'invitation reste valable même si la conversation est bloquée.
  }
  await supabase.functions.invoke('push', { body: { source: 'expo' } }).catch(() => undefined);
  return { attendancePrefilled: !attendance.error, messageSent };
}

export async function reorderGroupEventSetlist(
  eventId: string,
  approvedSongIds: readonly string[],
): Promise<void> {
  const result = await getSupabaseClient().rpc('reorder_event_setlist', {
    p_event_id: eventId,
    p_song_ids: [...approvedSongIds],
  });
  if (result.error) throw result.error;
}
