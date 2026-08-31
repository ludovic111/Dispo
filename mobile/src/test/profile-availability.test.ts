import { describe, expect, it } from '@jest/globals';

import {
  availableDayKey,
  isAvailableDayKey,
  normalizeAvailableDates,
  toggleAvailableDate,
} from '@/features/profiles/profile-availability-model';

describe('disponibilités du profil', () => {
  it('normalise, trie et déduplique les jours valides', () => {
    expect(
      normalizeAvailableDates([
        '2026-09-12T09:00:00Z',
        '2026-09-03',
        '2026-09-12',
        '2026-02-30',
        'invalide',
      ]),
    ).toEqual(['2026-09-03', '2026-09-12']);
  });

  it('le même geste ajoute puis retire une date', () => {
    expect(toggleAvailableDate([], '2026-09-12')).toEqual(['2026-09-12']);
    expect(toggleAvailableDate(['2026-09-12'], '2026-09-12')).toEqual([]);
  });

  it('produit une clé locale et refuse les dates impossibles', () => {
    expect(availableDayKey(new Date(2026, 8, 7, 12))).toBe('2026-09-07');
    expect(isAvailableDayKey('2024-02-29')).toBe(true);
    expect(isAvailableDayKey('2025-02-29')).toBe(false);
  });
});
