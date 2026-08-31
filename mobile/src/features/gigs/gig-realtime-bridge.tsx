import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  createCoalescedInvalidator,
  gigRealtimeTables,
  invalidateGigRealtimeData,
} from './gig-realtime';

import { useAuth } from '@/features/auth/auth-context';
import { getSupabaseClient } from '@/services/supabase/client';
import { uniqueRealtimeTopic } from '@/services/supabase/realtime-topic';

/** Owns the account-wide SOS/application streams independently from screens. */
export function GigRealtimeBridge() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? '';

  useEffect(() => {
    if (!userId) return;
    const invalidator = createCoalescedInvalidator(() =>
      invalidateGigRealtimeData(queryClient, userId),
    );
    const supabase = getSupabaseClient();
    const channel = supabase.channel(uniqueRealtimeTopic(`gigs:${userId}`));
    for (const table of gigRealtimeTables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, invalidator.schedule);
    }
    channel.subscribe();
    return () => {
      invalidator.cancel();
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return null;
}
