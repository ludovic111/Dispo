import { describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

import {
  useEventHasUnseenChange,
  useMarkEventChangeSeen,
} from '@/features/groups/group-event-changes';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
function Status({ user, revision }: { user: string; revision: string }) {
  const changed = useEventHasUnseenChange(user, 'event', revision);
  return <Text testID={user}>{changed ? 'unread' : 'read'}</Text>;
}
function OpenEvent({ user, revision }: { user: string; revision: string }) {
  useMarkEventChangeSeen(user, 'event', revision);
  return null;
}
describe('lecture individuelle des changements d’événement', () => {
  it('s’efface pour le lecteur seul et revient à la modification suivante', async () => {
    await AsyncStorage.clear();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const first = '2026-09-09T12:00:00Z';
    const second = '2026-09-09T13:00:00Z';
    const view = await render(
      <>
        <Status user="alice" revision={first} />
        <Status user="bob" revision={first} />
      </>,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(view.getByTestId('alice')).toHaveTextContent('unread'));
    await view.rerender(
      <>
        <Status user="alice" revision={first} />
        <Status user="bob" revision={first} />
        <OpenEvent user="alice" revision={first} />
      </>,
    );
    await waitFor(() => expect(view.getByTestId('alice')).toHaveTextContent('read'));
    expect(view.getByTestId('bob')).toHaveTextContent('unread');
    await view.rerender(<Status user="alice" revision={second} />);
    await waitFor(() => expect(view.getByTestId('alice')).toHaveTextContent('unread'));
    await view.unmount();
    client.clear();
  });
});
