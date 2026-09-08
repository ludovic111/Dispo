import { describe, expect, it } from '@jest/globals';

import {
  canUsePremiumCapability,
  premiumBetaPolicy,
  premiumCapabilities,
  subscriptionPrice,
  subscriptionGroupLimit,
  subscriptionCanUse,
} from '@/features/premium/premium-model';

describe('politique Premium de la bêta ouverte', () => {
  it('inclut le répertoire personnel dans les capacités Premium', () => {
    expect(premiumCapabilities).toEqual([
      'leadAdditionalGroup',
      'advancedFilters',
      'recurringEvents',
      'configurableReminders',
      'autoSOS',
      'expandedPortfolio',
      'personalRepertoire',
    ]);
  });

  it('ouvre chacune des capacités pendant la bêta', () => {
    expect(premiumCapabilities.every(canUsePremiumCapability)).toBe(true);
    expect(premiumBetaPolicy.capabilities).toEqual({
      advancedFilters: true,
      autoSOS: true,
      configurableReminders: true,
      expandedPortfolio: true,
      personalRepertoire: true,
      leadAdditionalGroup: true,
      recurringEvents: true,
    });
  });

  it('interdit toute surface d’achat ou de débit dans cette version', () => {
    expect(premiumBetaPolicy).toMatchObject({ isBeta: true, purchasesEnabled: false });
    expect(premiumBetaPolicy.visibleSections).toEqual([
      'hero',
      'betaNotice',
      'plans',
      'perks',
      'freeFoundations',
    ]);
    expect(premiumBetaPolicy.visibleSections).toContain('plans');
    expect(premiumBetaPolicy.visibleSections).not.toContain('purchase');
  });
});

it('defines distinct launch rights and partner prices without enabling purchases', () => {
  expect(subscriptionGroupLimit('free', false)).toBe(0);
  expect(subscriptionGroupLimit('group', false)).toBe(1);
  expect(subscriptionGroupLimit('premium', false)).toBe(Infinity);
  expect(subscriptionGroupLimit('free', true)).toBe(Infinity);
  for (const capability of premiumCapabilities) {
    expect(subscriptionCanUse('group', capability, false)).toBe(false);
    expect(subscriptionCanUse('premium', capability, false)).toBe(true);
  }
  expect(subscriptionPrice('group', 'monthly')).toBe(290);
  expect(subscriptionPrice('premium', 'annual')).toBe(6900);
  expect(subscriptionPrice('group', 'monthly', true)).toBe(203);
  expect(subscriptionPrice('premium', 'annual', true)).toBe(4830);
});
