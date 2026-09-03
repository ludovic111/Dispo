import { describe, expect, it } from '@jest/globals';

import {
  availableDayKey,
  dateFromLocalTime,
  hasInvalidAvailabilityTimeSlots,
  isAvailableDayKey,
  localTimeValue,
  normalizeAvailableDates,
  normalizeAvailabilityTimeSlots,
  removeAvailableDay,
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

  it('conserve plusieurs créneaux HH:mm locaux et écarte les entrées invalides', () => {
    expect(
      normalizeAvailabilityTimeSlots(
        {
          '2026-09-07': [
            { end: '12:30', start: '09:15' },
            { end: '18:00', start: '14:00' },
            { end: '09:00', start: '10:00' },
            { end: '12:30', start: '09:15' },
          ],
          '2026-09-08': [{ end: '12:00', start: '09:00' }],
        },
        ['2026-09-07'],
      ),
    ).toEqual({
      '2026-09-07': [
        { end: '12:30', start: '09:15' },
        { end: '18:00', start: '14:00' },
      ],
    });
    const local = dateFromLocalTime('2026-09-07', '09:15');
    expect(localTimeValue(local)).toBe('09:15');
    expect(local.getHours()).toBe(9);
    expect(local.getMinutes()).toBe(15);
  });

  it('supprime les créneaux avec leur date et refuse une fin antérieure', () => {
    const availability = {
      dates: ['2026-09-07', '2026-09-08'],
      timeSlots: {
        '2026-09-07': [{ end: '08:30', start: '09:00' }],
        '2026-09-08': [{ end: '12:00', start: '09:00' }],
      },
    };
    expect(hasInvalidAvailabilityTimeSlots(availability)).toBe(true);
    expect(removeAvailableDay(availability, '2026-09-07')).toEqual({
      dates: ['2026-09-08'],
      timeSlots: { '2026-09-08': [{ end: '12:00', start: '09:00' }] },
    });
  });
});
