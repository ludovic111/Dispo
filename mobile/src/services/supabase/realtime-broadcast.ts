import { getSupabaseClient } from './client';

type SupabaseClient = ReturnType<typeof getSupabaseClient>;
type RealtimeChannel = ReturnType<SupabaseClient['channel']>;
type BroadcastListener = (payload: unknown) => void;

interface BroadcastEntry {
  channel: RealtimeChannel | null;
  client: SupabaseClient;
  closing: boolean;
  event: string;
  listeners: Set<BroadcastListener>;
  subscribed: boolean;
  topic: string;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}

export interface RealtimeBroadcastController {
  send: (payload: Record<string, unknown>) => void;
  unsubscribe: () => void;
}

const entries = new Map<string, BroadcastEntry>();

function attach(entry: BroadcastEntry): void {
  entry.closing = false;
  entry.subscribed = false;
  const channel = entry.client
    .channel(entry.topic)
    .on('broadcast', { event: entry.event }, ({ payload }) => {
      for (const listener of entry.listeners) listener(payload);
    });
  entry.channel = channel;
  channel.subscribe((status) => {
    if (entry.channel === channel) entry.subscribed = !entry.closing && status === 'SUBSCRIBED';
  });
}

function closeWhenIdle(entry: BroadcastEntry): void {
  entry.teardownTimer = null;
  if (entry.listeners.size > 0 || entry.closing) return;
  entry.closing = true;
  entry.subscribed = false;
  const closingChannel = entry.channel;
  if (!closingChannel) return;
  void entry.client
    .removeChannel(closingChannel)
    .catch(() => 'error' as const)
    .then((status) => {
      if (entry.channel !== closingChannel) return;
      if (status !== 'ok') {
        entry.closing = false;
        if (entry.listeners.size === 0)
          entry.teardownTimer = setTimeout(() => closeWhenIdle(entry), 1000);
        return;
      }
      if (entry.listeners.size > 0) attach(entry);
      else entries.delete(entry.topic);
    });
}

/**
 * Shares one stable Broadcast channel per topic while keeping local listeners
 * independent. This avoids reuse/removal races in realtime-js during remounts.
 */
export function subscribeToRealtimeBroadcast(
  topic: string,
  event: string,
  listener: BroadcastListener,
): RealtimeBroadcastController {
  const client = getSupabaseClient();
  let entry = entries.get(topic);
  if (entry && entry.event !== event)
    throw new Error(`Realtime topic ${topic} is already bound to ${entry.event}.`);
  if (!entry) {
    entry = {
      channel: null,
      client,
      closing: false,
      event,
      listeners: new Set(),
      subscribed: false,
      teardownTimer: null,
      topic,
    };
    entries.set(topic, entry);
    attach(entry);
  }
  if (entry.teardownTimer) {
    clearTimeout(entry.teardownTimer);
    entry.teardownTimer = null;
  }
  entry.listeners.add(listener);
  let active = true;
  return {
    send: (payload) => {
      if (!active || !entry?.subscribed || entry.closing) return;
      void entry.channel?.send({ event, payload, type: 'broadcast' });
    },
    unsubscribe: () => {
      if (!active || !entry) return;
      active = false;
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && !entry.teardownTimer)
        entry.teardownTimer = setTimeout(() => closeWhenIdle(entry), 0);
    },
  };
}
