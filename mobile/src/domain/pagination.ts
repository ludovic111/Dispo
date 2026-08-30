export interface Page<T> {
  items: T[];
  nextPage: number | null;
}

export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  if (!Number.isInteger(page) || page < 0) throw new Error('page must be a non-negative integer');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('pageSize must be between 1 and 100');
  }
  const from = page * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function makePage<T>(items: T[], page: number, pageSize: number): Page<T> {
  return { items, nextPage: items.length === pageSize ? page + 1 : null };
}
