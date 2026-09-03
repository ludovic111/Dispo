const dayKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface AvailabilityTimeSlot {
  end: string;
  start: string;
}

export type AvailabilityTimeSlots = Record<string, AvailabilityTimeSlot[]>;

export interface ProfileAvailability {
  dates: string[];
  timeSlots: AvailabilityTimeSlots;
}

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

export function isLocalAvailabilityTime(value: string): boolean {
  return localTimePattern.test(value);
}

export function isValidAvailabilityTimeSlot(slot: AvailabilityTimeSlot): boolean {
  return (
    isLocalAvailabilityTime(slot.start) &&
    isLocalAvailabilityTime(slot.end) &&
    slot.start < slot.end
  );
}

export function normalizeAvailabilityTimeSlots(
  value: unknown,
  availableDates: readonly string[],
): AvailabilityTimeSlots {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  const dates = new Set(normalizeAvailableDates(availableDates));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([day, slots]) => dates.has(day) && Array.isArray(slots))
      .map(([day, slots]) => {
        const seen = new Set<string>();
        const normalized = (slots as unknown[])
          .flatMap((slot): AvailabilityTimeSlot[] => {
            if (!slot || Array.isArray(slot) || typeof slot !== 'object') return [];
            const start = 'start' in slot && typeof slot.start === 'string' ? slot.start : '';
            const end = 'end' in slot && typeof slot.end === 'string' ? slot.end : '';
            const candidate = { end, start };
            if (!isValidAvailabilityTimeSlot(candidate)) return [];
            const signature = `${start}-${end}`;
            if (seen.has(signature)) return [];
            seen.add(signature);
            return [candidate];
          })
          .sort(
            (left, right) =>
              left.start.localeCompare(right.start) || left.end.localeCompare(right.end),
          );
        return [day, normalized] as const;
      })
      .filter(([, slots]) => slots.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function normalizeProfileAvailability(value: ProfileAvailability): ProfileAvailability {
  const dates = normalizeAvailableDates(value.dates);
  return {
    dates,
    timeSlots: normalizeAvailabilityTimeSlots(value.timeSlots, dates),
  };
}

export function profileAvailabilitySignature(value: ProfileAvailability): string {
  const normalized = normalizeProfileAvailability(value);
  return JSON.stringify(normalized);
}

export function removeAvailableDay(value: ProfileAvailability, day: string): ProfileAvailability {
  const dates = normalizeAvailableDates(value.dates.filter((candidate) => candidate !== day));
  return {
    dates,
    timeSlots: normalizeAvailabilityTimeSlots(value.timeSlots, dates),
  };
}

export function hasInvalidAvailabilityTimeSlots(value: ProfileAvailability): boolean {
  const dates = new Set(normalizeAvailableDates(value.dates));
  return Object.entries(value.timeSlots).some(
    ([day, slots]) => !dates.has(day) || slots.some((slot) => !isValidAvailabilityTimeSlot(slot)),
  );
}

export function localTimeValue(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function dateFromLocalTime(day: string, time: string): Date {
  const validDay = isAvailableDayKey(day) ? day : availableDayKey(new Date());
  const validTime = isLocalAvailabilityTime(time) ? time : '09:00';
  const [year, month, date] = validDay.split('-').map(Number) as [number, number, number];
  const [hour, minute] = validTime.split(':').map(Number) as [number, number];
  return new Date(year, month - 1, date, hour, minute, 0, 0);
}

export function defaultAvailabilityTimeSlot(
  existing: readonly AvailabilityTimeSlot[],
): AvailabilityTimeSlot {
  const preferred: AvailabilityTimeSlot[] = [
    { end: '12:00', start: '09:00' },
    { end: '17:00', start: '13:00' },
    { end: '22:00', start: '18:00' },
  ];
  const hourly = Array.from({ length: 23 }, (_, hour): AvailabilityTimeSlot => ({
    end: `${String(hour + 1).padStart(2, '0')}:00`,
    start: `${String(hour).padStart(2, '0')}:00`,
  }));
  const candidates = [...preferred, ...hourly, { end: '23:59', start: '23:00' }];
  return (
    candidates.find(
      (candidate) =>
        !existing.some((slot) => slot.start === candidate.start && slot.end === candidate.end),
    ) ?? { end: '23:59', start: '23:58' }
  );
}
