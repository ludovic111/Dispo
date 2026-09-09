import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { useRespondToDirectSession } from '@/features/sessions/session-queries';
import { respondToDirectSession } from '@/features/sessions/session-repository';

const mockCelebrate = jest.fn();
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/features/gigs/sos-acceptance-celebration', () => ({
  useSosAcceptanceCelebration: () => mockCelebrate,
}));
jest.mock('@/features/sessions/session-repository', () => ({ respondToDirectSession: jest.fn() }));
const respond = jest.mocked(respondToDirectSession);
const ticket = { title: 'Concert jazz', date: '2026-09-12T18:00:00Z' };
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: Infinity },
      queries: { retry: false, gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  mockCelebrate.mockClear();
  respond.mockReset();
});
describe('confirmation de participation au SOS', () => {
  it('attend le serveur avant de célébrer et de retirer la demande', async () => {
    let resolve!: () => void;
    respond.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { client, wrapper } = setup();
    const pending = {
      pendingResponses: [{ gigId: 'gig', kind: 'direct' }],
      past: [],
      upcoming: [],
    };
    client.setQueryData(['sessions', 'agenda', 'me'], pending);
    const { result, unmount } = await renderHook(() => useRespondToDirectSession(), { wrapper });
    let operation!: Promise<void>;
    await act(() => {
      operation = result.current.mutateAsync({ gigId: 'gig', accept: true, celebration: ticket });
    });
    expect(mockCelebrate).not.toHaveBeenCalled();
    expect(client.getQueryData(['sessions', 'agenda', 'me'])).toEqual(pending);
    await act(async () => {
      resolve();
      await operation;
    });
    expect(mockCelebrate).toHaveBeenCalledWith(ticket);
    expect(client.getQueryState(['sessions', 'agenda', 'me'])?.isInvalidated).toBe(true);
    await unmount();
    client.clear();
  });
  it('ne célèbre ni un refus ni une erreur réseau', async () => {
    const { client, wrapper } = setup();
    const { result, unmount } = await renderHook(() => useRespondToDirectSession(), { wrapper });
    respond.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.mutateAsync({ gigId: 'gig', accept: false, celebration: ticket });
    });
    respond.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await expect(
        result.current.mutateAsync({ gigId: 'gig', accept: true, celebration: ticket }),
      ).rejects.toThrow('offline');
    });
    expect(mockCelebrate).not.toHaveBeenCalled();
    await unmount();
    client.clear();
  });
});
