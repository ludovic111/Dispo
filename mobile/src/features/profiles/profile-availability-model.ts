const dayKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isAvailableDayKey(value: string): boolean {
  const match = dayKeyPattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function availableDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeAvailableDates(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.slice(0, 10)).filter(isAvailableDayKey))].sort();
}

export function toggleAvailableDate(values: readonly string[], day: string): string[] {
  const normalized = normalizeAvailableDates(values);
  if (!isAvailableDayKey(day)) return normalized;
  return normalized.includes(day)
    ? normalized.filter((value) => value !== day)
    : normalizeAvailableDates([...normalized, day]);
}
