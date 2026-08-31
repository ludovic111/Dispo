import { describe, expect, it, jest } from '@jest/globals';

import { loadAllPages } from '@/features/pagination/exhaustive-pages';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('chargement exhaustif des pages', () => {
  it('enchaîne les pages jusqu’au dernier résultat', async () => {
    let page = 0;
    const fetchNextPage = jest.fn(async () => {
      page += 1;
      return { error: null, hasNextPage: page < 3, isError: false };
    });

    await loadAllPages({ fetchNextPage, initialHasNextPage: true, loadKey: 'drain-all' });

    expect(fetchNextPage).toHaveBeenCalledTimes(3);
  });

  it('partage une seule boucle entre deux consommateurs de la même query', async () => {
    const gate = deferred();
    const firstFetcher = jest.fn(async () => {
      await gate.promise;
      return { error: null, hasNextPage: false, isError: false };
    });
    const competingFetcher = jest.fn(async () => ({
      error: null,
      hasNextPage: false,
      isError: false,
    }));

    const first = loadAllPages({
      fetchNextPage: firstFetcher,
      initialHasNextPage: true,
      loadKey: 'shared-query',
    });
    const competing = loadAllPages({
      fetchNextPage: competingFetcher,
      initialHasNextPage: true,
      loadKey: 'shared-query',
    });

    expect(competing).toBe(first);
    expect(firstFetcher).toHaveBeenCalledTimes(1);
    expect(competingFetcher).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([first, competing]);
  });

  it('libère la garde après une erreur afin que le retry puisse repartir', async () => {
    const failure = new Error('page-2-failed');
    await expect(
      loadAllPages({
        fetchNextPage: async () => ({ error: failure, hasNextPage: true, isError: true }),
        initialHasNextPage: true,
        loadKey: 'retry-after-error',
      }),
    ).rejects.toBe(failure);

    const retry = jest.fn(async () => ({
      error: null,
      hasNextPage: false,
      isError: false,
    }));
    await loadAllPages({
      fetchNextPage: retry,
      initialHasNextPage: true,
      loadKey: 'retry-after-error',
    });

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
