import { expect, it } from '@jest/globals';
import { useQuery } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SessionQueryProvider } from '@/providers/session-query-provider';

it('loads the new account without exposing or canceling its data when an old request resolves late', async () => {
  let resolveOld!: (value: string) => void;
  const oldRequest = new Promise<string>((resolve) => {
    resolveOld = resolve;
  });
  function Profile({ user }: { user: string }) {
    const query = useQuery({
      queryKey: ['profile'],
      queryFn: () => (user === 'old' ? oldRequest : Promise.resolve('New account')),
    });
    return <Text>{query.data ?? 'Loading'}</Text>;
  }
  const view = await render(
    <SessionQueryProvider userId="old">
      <Profile user="old" />
    </SessionQueryProvider>,
  );
  await view.rerender(
    <SessionQueryProvider userId="new">
      <Profile user="new" />
    </SessionQueryProvider>,
  );
  await waitFor(() => expect(view.getByText('New account')).toBeTruthy());
  await act(async () => resolveOld('Private old account'));
  expect(view.queryByText('Private old account')).toBeNull();
  expect(view.queryByText('Loading')).toBeNull();
  expect(view.getByText('New account')).toBeTruthy();
  await view.unmount();
});
