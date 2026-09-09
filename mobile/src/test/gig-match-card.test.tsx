import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { GigCard } from '@/features/gigs/gig-card';
import type { GigSummary } from '@/features/gigs/gig-model';
import { useGigMatches } from '@/features/gigs/gig-queries';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'host' } } }),
}));
jest.mock('@/features/gigs/gig-queries', () => ({ useGigMatches: jest.fn() }));
jest.mock('@/components/ui/ticket-card', () => ({
  TicketCard: ({ children }: { children: import('react').ReactNode }) => children,
  Barcode: () => null,
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({ palette: { text: '#050814' } }),
}));
const matches = jest.mocked(useGigMatches);
const gig: GigSummary = {
  id: 'gig',
  hostId: 'host',
  date: '2099-09-10T18:00:00Z',
  title: 'Concert',
  genre: 'Jazz',
  place: 'Genève',
  wantedInstruments: ['Piano', 'Basse'],
  filledInstruments: ['Basse'],
  targetId: null,
} as GigSummary;
describe('repère de musicien compatible sur le ticket SOS', () => {
  it('signale un match au créateur seulement pour un poste ouvert', async () => {
    matches.mockReturnValue({
      data: { pages: [{ items: [{ matchingInstruments: ['Piano'] }] }] },
      isError: false,
    } as never);
    const view = await render(<GigCard gig={gig} onPress={() => undefined} />);
    expect(view.getByRole('button').props.accessibilityHint).toContain('Musicien compatible');
    matches.mockReturnValue({
      data: { pages: [{ items: [{ matchingInstruments: ['Basse'] }] }] },
      isError: false,
    } as never);
    await view.rerender(<GigCard gig={gig} onPress={() => undefined} />);
    expect(view.getByRole('button').props.accessibilityHint).toBeUndefined();
    await view.unmount();
  });
  it('ne signale pas les demandes déjà envoyées ni les SOS d’un autre créateur', async () => {
    matches.mockReturnValue({
      data: { pages: [{ items: [{ matchingInstruments: ['Piano'] }] }] },
      isError: false,
    } as never);
    const view = await render(
      <GigCard gig={{ ...gig, hostId: 'someone' }} onPress={() => undefined} />,
    );
    expect(view.getByRole('button').props.accessibilityHint).toBeUndefined();
    await view.rerender(
      <GigCard
        gig={{ ...gig, targetId: 'musician', targetStatus: 'pending' }}
        onPress={() => undefined}
      />,
    );
    expect(view.getByRole('button').props.accessibilityHint).toBeUndefined();
    await view.unmount();
  });
});
