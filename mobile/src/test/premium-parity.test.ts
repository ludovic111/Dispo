import { describe, expect, it } from '@jest/globals';

import {
  defaultDiscoveryFilters,
  effectiveDiscoveryFilters,
} from '@/features/discovery/discovery-model';
import {
  premiumCapabilities,
  subscriptionPrice,
  subscriptionGroupLimit,
  subscriptionCanUse,
} from '@/features/premium/premium-model';

describe('paid launch rights', () => {
  it('allows Groupe to lead one group, Premium unlimited, and free accounts none', () => {
    expect(subscriptionGroupLimit('free')).toBe(0);
    expect(subscriptionGroupLimit('group')).toBe(1);
    expect(subscriptionGroupLimit('premium')).toBe(Infinity);
    expect(premiumCapabilities).toContain('personalRepertoire');
    for (const capability of premiumCapabilities) {
      expect(subscriptionCanUse('free', capability)).toBe(false);
      expect(subscriptionCanUse('group', capability)).toBe(false);
      expect(subscriptionCanUse('premium', capability)).toBe(true);
    }
  });
  it('uses real Apple price points with a partner reduction of at least 30%', () => {
    expect(subscriptionPrice('group', 'monthly')).toBe(290);
    expect(subscriptionPrice('premium', 'annual')).toBe(6900);
    expect(subscriptionPrice('group', 'monthly', true)).toBe(200);
    expect(subscriptionPrice('premium', 'annual', true)).toBe(4800);
    for (const tier of ['group', 'premium'] as const)
      for (const period of ['monthly', 'annual'] as const)
        expect(subscriptionPrice(tier, period, true)).toBeLessThanOrEqual(
          subscriptionPrice(tier, period) * 0.7,
        );
  });
  it('removes advanced filters after expiry while retaining free search and school criteria', () => {
    const input = {
      ...defaultDiscoveryFilters,
      genres: ['Jazz'],
      levels: ['Avancé'],
      playedWithFriend: true,
      wellRated: true,
      schoolIds: ['school'],
      instruments: ['Piano'],
      neededDate: '2026-09-10',
    };
    expect(effectiveDiscoveryFilters(input, false)).toEqual({
      ...input,
      genres: [],
      levels: [],
      playedWithFriend: false,
      wellRated: false,
    });
    expect(effectiveDiscoveryFilters(input, true)).toBe(input);
  });
});
