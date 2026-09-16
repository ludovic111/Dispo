import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { GigCard } from '@/features/gigs/gig-card';
import { EMPTY_GIG_MATCH, type GigSummary } from '@/features/gigs/gig-model';
import { useGigCandidateCount } from '@/features/gigs/gig-queries';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'host' } } }),
}));
jest.mock('@/features/gigs/gig-queries', () => ({ useGigCandidateCount: jest.fn() }));
jest.mock('@/components/ui/ticket-card', () => ({
  TicketCard: ({ children }: { children: import('react').ReactNode }) => children,
  Barcode: () => null,
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
const candidates = jest.mocked(useGigCandidateCount);
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
  it('signale un match au créateur seulement quand le serveur compte un candidat', async () => {
    candidates.mockReturnValue({ data: 2, isError: false } as never);
    const view = await render(<GigCard gig={gig} onPress={() => undefined} />);
    expect(view.getByRole('button').props.accessibilityHint).toContain('Musicien compatible');
    expect(candidates).toHaveBeenLastCalledWith('gig', true);
    candidates.mockReturnValue({ data: 0, isError: false } as never);
    await view.rerender(<GigCard gig={gig} onPress={() => undefined} />);
    expect(view.getByRole('button').props.accessibilityHint).toBeUndefined();
    await view.rerender(
      <GigCard gig={{ ...gig, filledInstruments: ['Piano', 'Basse'] }} onPress={() => undefined} />,
    );
    expect(candidates).toHaveBeenLastCalledWith('gig', false);
    await view.unmount();
  });
  it('affiche le score et les raisons au viewer quand une annonce lui correspond', async () => {
    candidates.mockReturnValue({ data: 0, isError: false } as never);
    const view = await render(
      <GigCard
        gig={{ ...gig, hostId: 'someone' }}
        match={{
          ...EMPTY_GIG_MATCH,
          availableOnDate: true,
          instruments: ['Piano'],
          reasons: ['instrument:Piano', 'level', 'available', 'friend'],
          relation: 'mutual',
          score: 82,
        }}
        onPress={() => undefined}
      />,
    );
    expect(view.getByRole('button').props.accessibilityLabel).toContain('Match {{score}} %');
    expect(view.queryByRole('progressbar')).toBeNull();
    expect(view.getByText('82 %')).toBeTruthy();
    expect(view.getByText('Dispo ce jour-là · Ami·e')).toBeTruthy();
    await view.unmount();
  });
  it('ne signale pas les demandes déjà envoyées ni les SOS d’un autre créateur', async () => {
    candidates.mockReturnValue({ data: 3, isError: false } as never);
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
