import { expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import GigsScreen from '@/app/(tabs)/sos';
import type { GigSummary } from '@/features/gigs/gig-model';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
jest.mock('@/components/ui/screen', () => ({
  Screen: ({ children }: { children: ReactNode }) => children,
  ScreenHeader: () => null,
  LoadingState: () => null,
  ErrorState: () => null,
  EmptyState: () => null,
}));
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/features/profiles/profile-queries', () => ({
  useProfile: () => ({ data: undefined }),
}));
jest.mock('@/features/gigs/gig-opened-store', () => ({ countUnopenedCompatibleGigs: () => 0 }));
jest.mock('@/features/gigs/gig-card', () => ({
  GigCard: ({ gig }: { gig: GigSummary }) => {
    const Text = jest.requireActual<typeof import('react-native')>('react-native').Text;
    return <Text>{gig.title}</Text>;
  },
}));
const mockGig = (title: string, hostId = 'other', instrument = 'Batterie') => ({
  id: title,
  title,
  hostId,
  wantedInstruments: [instrument],
  filledInstruments: [],
  targetId: null,
  date: '2026-09-20T10:00:00Z',
});
jest.mock('@/features/gigs/gig-queries', () => ({
  useGigs: () => ({
    data: {
      pages: [
        {
          items: [
            mockGig('Batteur demandé'),
            mockGig('Pianiste demandé', 'other', 'Piano'),
            mockGig('Mon annonce', 'me'),
          ],
        },
      ],
    },
  }),
  useHostedGigs: () => ({ data: { pages: [{ items: [mockGig('Mon annonce', 'me')] }] } }),
}));
it('shows the public feed without hidden instrument/school filters and keeps own SOS in Mes SOS', async () => {
  const view = await render(<GigsScreen />);
  expect(view.getAllByRole('tab')).toHaveLength(2);
  expect(view.queryByText('Pour moi')).toBeNull();
  expect(view.queryByText('École')).toBeNull();
  expect(view.queryByText('Tout')).toBeNull();
  expect(view.getByText('Batteur demandé')).toBeTruthy();
  expect(view.getByText('Pianiste demandé')).toBeTruthy();
  expect(view.queryByText('Mon annonce')).toBeNull();
  await fireEvent.press(view.getByRole('tab', { name: 'Mes SOS' }));
  expect(view.getByText('Mon annonce')).toBeTruthy();
  expect(view.queryByText('Batteur demandé')).toBeNull();
  await view.unmount();
});
