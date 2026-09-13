import { Platform } from 'react-native';
import Purchases, { type PurchasesStoreProduct } from 'react-native-purchases';

import { soldBillingPeriod, type BillingPeriod, type SubscriptionTier } from './premium-model';

import { revenueCatIOSKey } from '@/config/revenuecat';
import { getSupabaseClient } from '@/services/supabase/client';

export const subscriptionProducts = {
  group: { monthly: 'ch.dispo.app.group.monthly', annual: 'ch.dispo.app.group.annual' },
  premium: { monthly: 'ch.dispo.app.premium.monthly', annual: 'ch.dispo.app.premium.annual' },
} as const;
/** Product ids offered at checkout: monthly only since 2.5. */
export const storefrontProductIds = [
  subscriptionProducts.group[soldBillingPeriod],
  subscriptionProducts.premium[soldBillingPeriod],
] as const;
export type SubscriptionSource = 'none' | 'school_grant' | 'store';
export interface SchoolGrantWindow {
  endsAt: string;
  schoolShortName: string;
  startsAt: string;
}
export interface WorkshopSchool {
  freeWorkshopsUntil: string;
  schoolId: string;
  schoolShortName: string;
}
export interface SubscriptionState {
  tier: SubscriptionTier;
  /** Where the current tier comes from; a school grant hides the store checkout. */
  source: SubscriptionSource;
  expiresAt: string | null;
  /** Short name of the school granting Premium, when `source` is `school_grant`. */
  schoolShortName: string | null;
  /** A school grant that has not started yet for this member. */
  upcomingSchoolGrant: SchoolGrantWindow | null;
  /** Regular groups led by the user (workshop groups are never counted). */
  groupCount: number;
  workshopGroupCount: number;
  /** Schools whose workshop groups the user may create for free right now. */
  workshopSchools: WorkshopSchool[];
}
function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('invalid_subscription_state');
  return value;
}
function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
function schoolGrantFromResponse(value: unknown): SchoolGrantWindow | null {
  if (typeof value !== 'object' || value === null) return null;
  const grant = value as Record<string, unknown>;
  const schoolShortName = optionalString(grant.school_short_name);
  const startsAt = optionalString(grant.starts_at);
  const endsAt = optionalString(grant.ends_at);
  if (!schoolShortName || !startsAt || !endsAt) return null;
  return { endsAt, schoolShortName, startsAt };
}
function workshopSchoolsFromResponse(value: unknown): WorkshopSchool[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const schoolId = optionalString(row.school_id);
    const schoolShortName = optionalString(row.school_short_name);
    const freeWorkshopsUntil = optionalString(row.free_workshops_until);
    return schoolId && schoolShortName && freeWorkshopsUntil
      ? [{ freeWorkshopsUntil, schoolId, schoolShortName }]
      : [];
  });
}
export function subscriptionStateFromResponse(value: unknown): SubscriptionState {
  if (typeof value !== 'object' || value === null) throw new Error('invalid_subscription_state');
  const state = value as Record<string, unknown>;
  if (!['free', 'group', 'premium'].includes(String(state.tier)))
    throw new Error('invalid_subscription_state');
  const tier = state.tier as SubscriptionTier;
  const groupCount = nonNegativeInteger(state.group_count);
  const source: SubscriptionSource =
    state.source === 'school_grant' || state.source === 'store'
      ? state.source
      : tier === 'free'
        ? 'none'
        : 'store';
  return {
    tier,
    source,
    expiresAt: optionalString(state.expires_at),
    schoolShortName: source === 'school_grant' ? optionalString(state.school_short_name) : null,
    upcomingSchoolGrant: schoolGrantFromResponse(state.upcoming_school_grant),
    groupCount,
    workshopGroupCount:
      state.workshop_group_count === undefined ? 0 : nonNegativeInteger(state.workshop_group_count),
    workshopSchools: workshopSchoolsFromResponse(state.workshop_schools),
  };
}
export async function fetchSubscription(): Promise<SubscriptionState> {
  const { data, error } = await getSupabaseClient().rpc('get_my_subscription');
  if (error) throw error;
  return subscriptionStateFromResponse(data);
}
export async function syncSubscription(): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke('sync-subscription');
  if (error) throw error;
}

let purchaseQueue: Promise<unknown> = Promise.resolve();
/** Serialize identity switches and StoreKit operations across account changes. */
function forPurchaser<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const task = purchaseQueue
    .catch(() => undefined)
    .then(async () => {
      if (Platform.OS !== 'ios') throw new Error('purchases_unavailable_platform');
      const current = await getSupabaseClient().auth.getSession();
      if (current.data.session?.user.id !== userId) throw new Error('purchase_session_changed');
      if (!(await Purchases.isConfigured()))
        Purchases.configure({ apiKey: revenueCatIOSKey, appUserID: userId });
      else if ((await Purchases.getAppUserID()) !== userId) await Purchases.logIn(userId);
      const verified = await getSupabaseClient().auth.getSession();
      if (verified.data.session?.user.id !== userId) throw new Error('purchase_session_changed');
      return operation();
    });
  purchaseQueue = task;
  return task;
}
export const loadStoreProducts = (userId: string) =>
  forPurchaser(userId, () => Purchases.getProducts([...storefrontProductIds]));
export async function purchaseSubscription(
  userId: string,
  product: PurchasesStoreProduct,
): Promise<void> {
  await forPurchaser(userId, () => Purchases.purchaseStoreProduct(product));
  const current = await getSupabaseClient().auth.getSession();
  if (current.data.session?.user.id !== userId) throw new Error('purchase_session_changed');
  await syncSubscription();
}
export async function restoreSubscriptions(userId: string): Promise<SubscriptionState> {
  await forPurchaser(userId, () => Purchases.restorePurchases());
  const current = await getSupabaseClient().auth.getSession();
  if (current.data.session?.user.id !== userId) throw new Error('purchase_session_changed');
  await syncSubscription();
  return fetchSubscription();
}
export const redeemSchoolOffer = (userId: string) =>
  forPurchaser(userId, () => Purchases.presentCodeRedemptionSheet());
export const manageSubscriptions = (userId: string) =>
  forPurchaser(userId, () => Purchases.showManageSubscriptions());
export const refreshStoreSubscription = (userId: string) =>
  forPurchaser(userId, () => Purchases.getCustomerInfo());
export function storeProductFor(
  products: PurchasesStoreProduct[],
  tier: 'group' | 'premium',
  period: BillingPeriod = soldBillingPeriod,
) {
  return products.find((product) => product.identifier === subscriptionProducts[tier][period]);
}
