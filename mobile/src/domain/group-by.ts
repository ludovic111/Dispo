/** Index rows once while preserving their order and object identity. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const row of rows) {
    const value = key(row);
    const bucket = result.get(value);
    if (bucket) bucket.push(row);
    else result.set(value, [row]);
  }
  return result;
}
