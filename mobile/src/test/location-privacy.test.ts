import { describe, expect, it, jest } from '@jest/globals';

import { cityRoundedCoordinate } from '@/features/settings/settings-service';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

describe('grille de confidentialité de ville', () => {
  it('reproduit le pas Swift de 0,05 degré', () => {
    expect(cityRoundedCoordinate(46.2044)).toBe(46.2);
    expect(cityRoundedCoordinate(6.1432)).toBe(6.15);
    expect(cityRoundedCoordinate(-73.5673)).toBe(-73.55);
  });

  it('ne publie jamais une précision plus fine que la grille annoncée', () => {
    for (const value of [46.201, 46.224, 46.226, 46.249, 46.251]) {
      const rounded = cityRoundedCoordinate(value);
      expect(Math.abs(rounded / 0.05 - Math.round(rounded / 0.05))).toBeLessThan(1e-9);
    }
  });
});
