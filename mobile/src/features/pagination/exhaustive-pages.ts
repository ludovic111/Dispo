import { useEffect } from 'react';

export interface InfinitePageFetchResult {
  error: unknown;
  hasNextPage?: boolean;
  isError: boolean;
}

export type InfinitePageFetcher = () => Promise<InfinitePageFetchResult>;

interface LoadAllPagesInput {
  fetchNextPage: InfinitePageFetcher;
  initialHasNextPage: boolean;
  loadKey: string;
}

interface ExhaustivePagesInput {
  enabled: boolean;
  fetchNextPage: InfinitePageFetcher;
  hasNextPage: boolean | undefined;
  isError: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  loadKey: string;
}

const activeLoads = new Map<string, Promise<void>>();

function pageFetchError(value: unknown): Error {
  return value instanceof Error ? value : new Error('exhaustive_page_fetch_failed');
}

/**
 * Drains one infinite-query key exactly once at a time. Multiple mounted
 * consumers of the same cache key share the active promise instead of racing
 * `fetchNextPage` calls.
 */
export function loadAllPages({
  fetchNextPage,
  initialHasNextPage,
  loadKey,
}: LoadAllPagesInput): Promise<void> {
  if (!initialHasNextPage) return Promise.resolve();
  const active = activeLoads.get(loadKey);
  if (active) return active;

  const load = (async () => {
    let hasNextPage: boolean = initialHasNextPage;
    while (hasNextPage) {
      const result = await fetchNextPage();
      if (result.isError) throw pageFetchError(result.error);
      hasNextPage = result.hasNextPage === true;
    }
  })();
  activeLoads.set(loadKey, load);
  const clear = () => {
    if (activeLoads.get(loadKey) === load) activeLoads.delete(loadKey);
  };
  void load.then(clear, clear);
  return load;
}

/** Automatically drains an infinite query while its account/query key lives. */
export function useExhaustivePages({
  enabled,
  fetchNextPage,
  hasNextPage,
  isError,
  isFetchingNextPage,
  isLoading,
  loadKey,
}: ExhaustivePagesInput) {
  useEffect(() => {
    if (!enabled || isLoading || isError || isFetchingNextPage || !hasNextPage) return;
    void loadAllPages({
      fetchNextPage,
      initialHasNextPage: true,
      loadKey,
    }).catch(() => undefined);
  }, [enabled, fetchNextPage, hasNextPage, isError, isFetchingNextPage, isLoading, loadKey]);

  const blocked = isError;
  const loading = enabled && !blocked && (isLoading || isFetchingNextPage || hasNextPage === true);
  return {
    isComplete: enabled && !blocked && !loading,
    isLoading: loading,
  };
}
