/**
 * The six capabilities guarded by `AppStore.canUse` in the Swift reference.
 * Keep the raw values stable: they are product policy identifiers, not copy.
 */
export const premiumCapabilities = [
  'leadAdditionalGroup',
  'advancedFilters',
  'recurringEvents',
  'configurableReminders',
  'autoSOS',
  'expandedPortfolio',
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
    leadAdditionalGroup: true,
    recurringEvents: true,
  }) satisfies Readonly<Record<PremiumCapability, true>>,
  isBeta: true,
  purchasesEnabled: false,
  visibleSections: Object.freeze(['hero', 'betaNotice', 'perks', 'freeFoundations'] as const),
});

export function canUsePremiumCapability(capability: PremiumCapability): boolean {
  return premiumBetaPolicy.capabilities[capability];
}
