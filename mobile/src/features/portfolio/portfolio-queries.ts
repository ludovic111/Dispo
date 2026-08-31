import { useQuery } from '@tanstack/react-query';

import { fetchPortfolio } from './portfolio-repository';

export const portfolioKeys = {
  detail: (userId: string) => ['portfolio', userId] as const,
};

export function usePortfolio(userId: string) {
  return useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchPortfolio(userId, signal),
    queryKey: portfolioKeys.detail(userId),
  });
}
