/**
 * Premium capabilities, including the personal repertoire.
 * Keep the raw values stable: they are product policy identifiers, not copy.
 */
export const premiumCapabilities = [
  'leadAdditionalGroup',
  'advancedFilters',
  'recurringEvents',
  'configurableReminders',
  'autoSOS',
  'expandedPortfolio',
  'personalRepertoire',
] as const;

export type PremiumCapability = (typeof premiumCapabilities)[number];

/**
 * Dispo 2.4 is an open beta. There is no purchasable offer in this build and
 * every Premium capability is deliberately available to every beta account.
 */
export const premiumBetaPolicy = Object.freeze({
  capabilities: Object.freeze({
    advancedFilters: true,
    autoSOS: true,
    configurableReminders: true,
    expandedPortfolio: true,
    personalRepertoire: true,
    leadAdditionalGroup: true,
    recurringEvents: true,
  }) satisfies Readonly<Record<PremiumCapability, true>>,
  isBeta: true,
  purchasesEnabled: false,
  visibleSections: Object.freeze([
    'hero',
    'betaNotice',
    'plans',
    'perks',
    'freeFoundations',
  ] as const),
});

export function canUsePremiumCapability(capability: PremiumCapability): boolean {
  return premiumBetaPolicy.capabilities[capability];
}

export type SubscriptionTier = 'free' | 'group' | 'premium';
export type BillingPeriod = 'monthly' | 'annual';
export const subscriptionPlans = Object.freeze({
  group: { name: 'Dispo Groupe', monthly: 290, annual: 2900, groupLimit: 1 },
  premium: { name: 'Dispo Premium', monthly: 690, annual: 6900, groupLimit: Infinity },
});
export const partnerSchoolDiscountPercent = 30;
/** Amounts in CHF cents. These are the launch prices, not purchasable beta offers. */
export function subscriptionPrice(
  tier: Exclude<SubscriptionTier, 'free'>,
  period: BillingPeriod,
  partnerSchool = false,
): number {
  const amount = subscriptionPlans[tier][period];
  return partnerSchool ? Math.round((amount * (100 - partnerSchoolDiscountPercent)) / 100) : amount;
}
export function subscriptionGroupLimit(
  tier: SubscriptionTier,
  beta: boolean = premiumBetaPolicy.isBeta,
): number {
  if (beta) return Infinity;
  return tier === 'free' ? 0 : subscriptionPlans[tier].groupLimit;
}
export function subscriptionCanUse(
  tier: SubscriptionTier,
  _capability: PremiumCapability,
  beta: boolean = premiumBetaPolicy.isBeta,
): boolean {
  return beta || tier === 'premium';
}
