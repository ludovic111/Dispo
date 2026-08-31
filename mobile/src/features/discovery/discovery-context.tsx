import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

import {
  defaultDiscoveryFilters,
  type AvailabilityScope,
  type DiscoveryFilters,
} from './discovery-model';

interface DiscoveryState {
  filters: DiscoveryFilters;
  resetFilters: () => void;
  scope: AvailabilityScope;
  setFilters: (filters: DiscoveryFilters) => void;
  setScope: (scope: AvailabilityScope) => void;
}

const DiscoveryContext = createContext<DiscoveryState | null>(null);

export function DiscoveryProvider({ children }: PropsWithChildren) {
  const [filters, setFilters] = useState<DiscoveryFilters>(defaultDiscoveryFilters);
  const [scope, setScope] = useState<AvailabilityScope>('today');
  const value = useMemo(
    () => ({
      filters,
      resetFilters: () => setFilters(defaultDiscoveryFilters),
      scope,
      setFilters,
      setScope,
    }),
    [filters, scope],
  );
  return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
}

export function useDiscoveryState(): DiscoveryState {
  const value = useContext(DiscoveryContext);
  if (!value) throw new Error('useDiscoveryState must be used inside DiscoveryProvider');
  return value;
}
