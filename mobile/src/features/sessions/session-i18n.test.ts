import { describe, expect, it } from '@jest/globals';

import { countdownLabel } from './session-model';

describe('présentation localisée des sessions', () => {
  it('formate une durée sans abréviation française imposée', () => {
    const now = new Date('2026-08-31T10:00:00.000Z');
    const deadline = '2026-09-02T10:00:00.000Z';

    expect(countdownLabel(deadline, now, 'fr')).toBe('2 j');
    expect(countdownLabel(deadline, now, 'en')).toBe('2 days');
    expect(countdownLabel(deadline, now, 'ja')).toBe('2 日');
  });

  it('keeps hours and minutes in the selected unit on native runtimes', () => {
    const now = new Date('2026-09-08T20:00:00Z');
    expect(countdownLabel('2026-09-10T16:00:00Z', now, 'fr-FR')).toBe('44 h');
    expect(countdownLabel('2026-09-08T20:45:00Z', now, 'en')).toBe('45 min');
    expect(countdownLabel('2026-09-08T22:00:00Z', now, 'ja')).toBe('2 時間');
    expect(countdownLabel('2026-09-08T19:00:00Z', now, 'fr')).toBeNull();
  });
});
