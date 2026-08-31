import { describe, expect, it, jest } from '@jest/globals';

import { getSupabaseClient } from '@/services/supabase/client';
import { subscribeToRealtimeBroadcast } from '@/services/supabase/realtime-broadcast';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fakeChannel() {
  let receive: ((message: { payload: unknown }) => void) | undefined;
  const channel = {
    on: jest.fn((type: string, _config: Record<string, unknown>, callback: typeof receive) => {
      if (type === 'broadcast') receive = callback;
      return channel;
    }),
    send: jest.fn(async () => 'ok'),
    subscribe: jest.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return channel;
    }),
  };
  return {
    channel,
    receive: (payload: unknown) => receive?.({ payload }),
  };
}

describe('broker Realtime Broadcast', () => {
  it('partage le canal et récupère un remontage pendant sa fermeture asynchrone', async () => {
    jest.useFakeTimers();
    try {
      const first = fakeChannel();
      const second = fakeChannel();
      const firstRemoval = deferred<'ok'>();
      let generation = 0;
      const createChannel = jest.fn(() => (generation === 0 ? first.channel : second.channel));
      const removeChannel = jest.fn((channel: typeof first.channel) => {
        if (channel === first.channel) return firstRemoval.promise;
        return Promise.resolve('ok');
      });
      mockedClient.mockReturnValue({ channel: createChannel, removeChannel } as never);
      const firstListener = jest.fn();
      const secondListener = jest.fn();

      const firstController = subscribeToRealtimeBroadcast(
        'typing-conversation-1',
        'typing',
        firstListener,
      );
      const secondController = subscribeToRealtimeBroadcast(
        'typing-conversation-1',
        'typing',
        secondListener,
      );
      expect(createChannel).toHaveBeenCalledTimes(1);
      first.receive({ user_id: 'contact' });
      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);

      firstController.unsubscribe();
      expect(removeChannel).not.toHaveBeenCalled();
      secondController.unsubscribe();
      jest.runOnlyPendingTimers();
      expect(removeChannel).toHaveBeenCalledWith(first.channel);

      const remountedListener = jest.fn();
      const remountedController = subscribeToRealtimeBroadcast(
        'typing-conversation-1',
        'typing',
        remountedListener,
      );
      generation = 1;
      firstRemoval.resolve('ok');
      await firstRemoval.promise;
      await Promise.resolve();
      expect(createChannel).toHaveBeenCalledTimes(2);

      remountedController.send({ user_id: 'me' });
      expect(second.channel.send).toHaveBeenCalledWith({
        event: 'typing',
        payload: { user_id: 'me' },
        type: 'broadcast',
      });
      second.receive({ user_id: 'contact' });
      expect(remountedListener).toHaveBeenCalledTimes(1);

      remountedController.unsubscribe();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      expect(removeChannel).toHaveBeenCalledWith(second.channel);
    } finally {
      jest.useRealTimers();
    }
  });
});
