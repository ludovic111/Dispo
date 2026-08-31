import { describe, expect, it } from '@jest/globals';

import { formatSwiftPlaceholders } from '@/i18n/format';

describe('catalogue Swift partagé avec Expo', () => {
  it('remplace les valeurs séquentielles', () => {
    expect(
      formatSwiftPlaceholders('%lld membres · %lld morceaux · %lld événements', 4, 12, 3),
    ).toBe('4 membres · 12 morceaux · 3 événements');
  });

  it('respecte les positions explicites des traductions', () => {
    expect(formatSwiftPlaceholders('%2$@ a invité %1$@', 'Ludovic', 'Raphaël')).toBe(
      'Raphaël a invité Ludovic',
    );
  });
});
