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

export type SubscriptionTier = 'free' | 'group' | 'premium';
export type BillingPeriod = 'monthly' | 'annual';
export const subscriptionPlans = Object.freeze({
  group: { name: 'Dispo Groupe', monthly: 290, annual: 2900, groupLimit: 1 },
  premium: { name: 'Dispo Premium', monthly: 690, annual: 6900, groupLimit: Infinity },
});
export const partnerSchoolDiscountPercent = 30;
/** Reference prices in CHF cents; checkout always uses localized StoreKit prices. */
export function subscriptionPrice(
  tier: Exclude<SubscriptionTier, 'free'>,
  period: BillingPeriod,
  partnerSchool = false,
): number {
  const amount = subscriptionPlans[tier][period];
  const partner = {
    group: { monthly: 200, annual: 2000 },
    premium: { monthly: 480, annual: 4800 },
  };
  return partnerSchool ? partner[tier][period] : amount;
}
export function subscriptionGroupLimit(tier: SubscriptionTier): number {
  return tier === 'free' ? 0 : subscriptionPlans[tier].groupLimit;
}
export function subscriptionCanUse(
  tier: SubscriptionTier,
  _capability: PremiumCapability,
): boolean {
  return tier === 'premium';
}
