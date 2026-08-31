import { describe, expect, it } from '@jest/globals';

import {
  canUsePremiumCapability,
  premiumBetaPolicy,
  premiumCapabilities,
} from '@/features/premium/premium-model';

describe('politique Premium de la bêta ouverte', () => {
  it('reproduit les six capacités exactes de PremiumCapability côté Swift', () => {
    expect(premiumCapabilities).toEqual([
      'leadAdditionalGroup',
      'advancedFilters',
      'recurringEvents',
      'configurableReminders',
      'autoSOS',
      'expandedPortfolio',
    ]);
  });

  it('ouvre chacune des capacités pendant la bêta', () => {
    expect(premiumCapabilities.every(canUsePremiumCapability)).toBe(true);
    expect(premiumBetaPolicy.capabilities).toEqual({
      advancedFilters: true,
      autoSOS: true,
      configurableReminders: true,
      expandedPortfolio: true,
      leadAdditionalGroup: true,
      recurringEvents: true,
    });
  });

  it('interdit toute surface d’achat ou de débit dans cette version', () => {
    expect(premiumBetaPolicy).toMatchObject({ isBeta: true, purchasesEnabled: false });
    expect(premiumBetaPolicy.visibleSections).toEqual([
      'hero',
      'betaNotice',
      'perks',
      'freeFoundations',
    ]);
    expect(premiumBetaPolicy.visibleSections).not.toContain('plans');
    expect(premiumBetaPolicy.visibleSections).not.toContain('purchase');
  });
});
