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
});
