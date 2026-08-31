const realtimeTopicScope = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let realtimeTopicSequence = 0;

/**
 * Postgres Changes topics are local subscription identifiers, so each channel
 * gets its own topic. Recent realtime-js versions reuse an existing channel
 * with the same topic and reject adding Postgres callbacks after subscribe().
 */
export function uniqueRealtimeTopic(prefix: string): string {
  realtimeTopicSequence += 1;
  return `${prefix}:client-${realtimeTopicScope}-${realtimeTopicSequence}`;
}
