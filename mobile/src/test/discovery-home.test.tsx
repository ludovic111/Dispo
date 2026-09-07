import { expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import {
  HomeAvailabilitySection,
  HomeEmptyState,
  HomeGroupsSection,
} from '@/features/discovery/discovery-home-sections';
import type { AvailabilityScope } from '@/features/discovery/discovery-model';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'fr' }, t: (key: string) => key }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: true,
    palette: jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens').darkPalette,
  }),
}));

it('offers the first group only after a successful empty load and supports retry', async () => {
  const props = { groups: [], onCreate: jest.fn(), onOpen: jest.fn(), onRetry: jest.fn() };
  const view = await render(<HomeGroupsSection {...props} isError={false} isLoading />);
  expect(view.queryByText('Crée ton premier groupe')).toBeNull();
  await view.rerender(<HomeGroupsSection {...props} isError isLoading={false} />);
  expect(view.queryByText('Crée ton premier groupe')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Réessayer' }));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  await view.rerender(<HomeGroupsSection {...props} isError={false} isLoading={false} />);
  await fireEvent.press(view.getByRole('button', { name: 'Crée ton premier groupe' }));
  expect(props.onCreate).toHaveBeenCalledTimes(1);
  await view.unmount();
});

it('opens the chosen group, keeps cached groups on refresh error and exposes creation', async () => {
  const onOpen = jest.fn();
  const onCreate = jest.fn();
  const view = await render(
    <HomeGroupsSection
      groups={[
        {
          id: 'one',
          name: 'Jam by the lake',
          emoji: '🎷',
          photoUrl: null,
          memberCount: 4,
          date: '2026-09-10T18:00:00Z',
        },
        { id: 'two', name: 'Mon groupe', emoji: '🎶', photoUrl: null, memberCount: 1, date: null },
      ]}
      isError
      isLoading={false}
      onCreate={onCreate}
      onOpen={onOpen}
      onRetry={() => undefined}
    />,
  );
  expect(view.getByText(/4 membres/)).toBeTruthy();
  expect(view.getByText('Aucune session · 1 membre')).toBeTruthy();
  await fireEvent.press(view.getByText('Mon groupe'));
  expect(onOpen).toHaveBeenCalledWith('two');
  await fireEvent.press(view.getByRole('button', { name: 'Nouveau groupe' }));
  expect(onCreate).toHaveBeenCalledTimes(1);
  await view.unmount();
});

it('switches dates independently of groups and offers nearby exploration then filters', async () => {
  const onFilters = jest.fn();
  function Home() {
    const [scope, setScope] = useState<AvailabilityScope>('today');
    return (
      <>
        <HomeGroupsSection
          groups={[]}
          isError={false}
          isLoading={false}
          onCreate={() => undefined}
          onOpen={() => undefined}
          onRetry={() => undefined}
        />
        <HomeAvailabilitySection
          counts={{ today: 0, weekend: 0, nearby: 0 }}
          filterCount={1}
          onFilters={onFilters}
          onScopeChange={setScope}
          scope={scope}
        />
        <HomeEmptyState
          onExplore={() => (scope === 'nearby' ? onFilters() : setScope('nearby'))}
          scope={scope}
        />
      </>
    );
  }
  const view = await render(<Home />);
  await fireEvent.press(view.getByText('Ce week-end · 0'));
  expect(view.getByText('Personne ce week-end')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Ce week-end · 0', selected: true })).toBeTruthy();
  expect(view.getByText('Crée ton premier groupe')).toBeTruthy();
  await fireEvent.press(view.getByText('Voir les musiciens à proximité'));
  expect(view.getByText('Aucun musicien trouvé')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Près de chez toi · 0', selected: true })).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Filtres' }));
  expect(onFilters).toHaveBeenCalledTimes(1);
  await view.unmount();
});

it('uses the group photo, falls back on load failure and accepts a replacement photo', async () => {
  const group = {
    id: 'photo',
    name: 'Jam',
    emoji: '🎶',
    memberCount: 2,
    date: null,
    photoUrl: 'https://example.com/group.jpg',
  };
  const props = {
    isError: false,
    isLoading: false,
    onCreate: jest.fn(),
    onOpen: jest.fn(),
    onRetry: jest.fn(),
  };
  const view = await render(<HomeGroupsSection {...props} groups={[group]} />);
  expect(view.queryByText('🎶')).toBeNull();
  await fireEvent(view.getByLabelText('Photo de {{name}}'), 'error', {
    nativeEvent: { error: 'Unavailable' },
  });
  expect(view.getByText('🎶')).toBeTruthy();
  await view.rerender(
    <HomeGroupsSection
      {...props}
      groups={[{ ...group, photoUrl: 'https://example.com/replacement.jpg' }]}
    />,
  );
  expect(view.getByLabelText('Photo de {{name}}')).toBeTruthy();
  expect(view.queryByText('🎶')).toBeNull();
  await view.rerender(<HomeGroupsSection {...props} groups={[{ ...group, photoUrl: null }]} />);
  expect(view.getByText('🎶')).toBeTruthy();
  await view.unmount();
});
