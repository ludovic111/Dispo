/**
 * Subscription capability identifiers.
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

/** Since 2.5 these capabilities are open to every tier, free accounts included. */
export const freeCapabilities: readonly PremiumCapability[] = [
  'advancedFilters',
  'recurringEvents',
  'configurableReminders',
  'autoSOS',
  'personalRepertoire',
];

export type SubscriptionTier = 'free' | 'group' | 'premium';
export type BillingPeriod = 'monthly' | 'annual';
/** Only monthly plans are sold in the app since 2.5; annual rows stay mapped server-side. */
export const soldBillingPeriod: BillingPeriod = 'monthly';
export const subscriptionPlans = Object.freeze({
  group: { name: 'Dispo Groupe', monthly: 290, annual: 2900, groupLimit: 1 },
  premium: { name: 'Dispo Premium', monthly: 690, annual: 6900, groupLimit: 6 },
});
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
/** Regular (non-workshop) groups only: workshop groups of a school never count. */
export function canLeadAnotherGroup(tier: SubscriptionTier, ledGroupCount: number): boolean {
  return ledGroupCount < subscriptionGroupLimit(tier);
}
export function subscriptionCanUse(tier: SubscriptionTier, capability: PremiumCapability): boolean {
  if (freeCapabilities.includes(capability)) return true;
  return tier === 'premium';
}
