import { describe, expect, it } from '@jest/globals';

import {
  canLeadAnotherGroup,
  freeCapabilities,
  premiumCapabilities,
  soldBillingPeriod,
  subscriptionCanUse,
  subscriptionGroupLimit,
  subscriptionPrice,
} from '@/features/premium/premium-model';

describe('2.5 pricing rights', () => {
  it('lets Groupe lead one group, Premium six, and free accounts none', () => {
    expect(subscriptionGroupLimit('free')).toBe(0);
    expect(subscriptionGroupLimit('group')).toBe(1);
    expect(subscriptionGroupLimit('premium')).toBe(6);
    expect(canLeadAnotherGroup('free', 0)).toBe(false);
    expect(canLeadAnotherGroup('group', 0)).toBe(true);
    expect(canLeadAnotherGroup('group', 1)).toBe(false);
    expect(canLeadAnotherGroup('premium', 5)).toBe(true);
    expect(canLeadAnotherGroup('premium', 6)).toBe(false);
  });
  it('opens filters, recurrence, reminders and Auto-SOS to every tier', () => {
    expect([...freeCapabilities].sort()).toEqual(
      ['advancedFilters', 'autoSOS', 'configurableReminders', 'recurringEvents'].sort(),
    );
    for (const capability of freeCapabilities)
      for (const tier of ['free', 'group', 'premium'] as const)
        expect(subscriptionCanUse(tier, capability)).toBe(true);
  });
  it('keeps extra groups, the portfolio and the personal repertoire Premium-only', () => {
    const premiumOnly = premiumCapabilities.filter((cap) => !freeCapabilities.includes(cap));
    expect([...premiumOnly].sort()).toEqual(
      ['expandedPortfolio', 'leadAdditionalGroup', 'personalRepertoire'].sort(),
    );
    for (const capability of premiumOnly) {
      expect(subscriptionCanUse('free', capability)).toBe(false);
      expect(subscriptionCanUse('group', capability)).toBe(false);
      expect(subscriptionCanUse('premium', capability)).toBe(true);
    }
  });
  it('sells monthly plans only, at the real Apple price points', () => {
    expect(soldBillingPeriod).toBe('monthly');
    expect(subscriptionPrice('group', 'monthly')).toBe(290);
    expect(subscriptionPrice('premium', 'monthly')).toBe(690);
    expect(subscriptionPrice('group', 'monthly', true)).toBe(200);
    for (const tier of ['group', 'premium'] as const)
      expect(subscriptionPrice(tier, 'monthly', true)).toBeLessThanOrEqual(
        subscriptionPrice(tier, 'monthly') * 0.7,
      );
  });
});
