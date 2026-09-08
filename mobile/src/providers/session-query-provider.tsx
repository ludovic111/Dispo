import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type PropsWithChildren, useEffect, useState } from 'react';

function QueryScope({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true },
          mutations: { retry: 0 },
        },
      }),
  );
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A new account mounts with its own cache; old requests cannot populate it. */
export function SessionQueryProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string | null }>) {
  return <QueryScope key={userId ?? 'signed-out'}>{children}</QueryScope>;
}
