import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

import {
  defaultDiscoveryFilters,
  effectiveDiscoveryFilters,
  type AvailabilityScope,
  type DiscoveryFilters,
} from './discovery-model';

import { usePremiumCapability } from '@/features/premium/subscription-queries';

interface DiscoveryState {
  filters: DiscoveryFilters;
  resetFilters: () => void;
  scope: AvailabilityScope;
  setFilters: (filters: DiscoveryFilters) => void;
  setScope: (scope: AvailabilityScope) => void;
}

const DiscoveryContext = createContext<DiscoveryState | null>(null);

export function DiscoveryProvider({ children }: PropsWithChildren) {
  const premium = usePremiumCapability('advancedFilters');
  const [filters, setFilters] = useState<DiscoveryFilters>(defaultDiscoveryFilters);
  const [scope, setScope] = useState<AvailabilityScope>('nearby');
  const value = useMemo(
    () => ({
      filters: effectiveDiscoveryFilters(filters, premium),
      resetFilters: () => {
        setFilters(defaultDiscoveryFilters);
        setScope('nearby');
      },
      scope,
      setFilters,
      setScope,
    }),
    [filters, scope, premium],
  );
  return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
}

export function useDiscoveryState(): DiscoveryState {
  const value = useContext(DiscoveryContext);
  if (!value) throw new Error('useDiscoveryState must be used inside DiscoveryProvider');
  return value;
}
