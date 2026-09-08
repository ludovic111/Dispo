import { Platform } from 'react-native';
import Purchases, { type PurchasesStoreProduct } from 'react-native-purchases';

import type { BillingPeriod, SubscriptionTier } from './premium-model';

import { revenueCatIOSKey } from '@/config/revenuecat';
import { getSupabaseClient } from '@/services/supabase/client';

export const subscriptionProducts = {
  group: { monthly: 'ch.dispo.app.group.monthly', annual: 'ch.dispo.app.group.annual' },
  premium: { monthly: 'ch.dispo.app.premium.monthly', annual: 'ch.dispo.app.premium.annual' },
} as const;
export interface SubscriptionState {
  tier: SubscriptionTier;
  expiresAt: string | null;
  groupCount: number;
}
export function subscriptionStateFromResponse(value: unknown): SubscriptionState {
  if (typeof value !== 'object' || value === null) throw new Error('invalid_subscription_state');
  const state = value as Record<string, unknown>;
  if (
    !['free', 'group', 'premium'].includes(String(state.tier)) ||
    typeof state.group_count !== 'number' ||
    !Number.isSafeInteger(state.group_count) ||
    state.group_count < 0
  )
    throw new Error('invalid_subscription_state');
  return {
    tier: state.tier as SubscriptionTier,
    expiresAt: typeof state.expires_at === 'string' ? state.expires_at : null,
    groupCount: state.group_count,
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
  forPurchaser(userId, () =>
    Purchases.getProducts(Object.values(subscriptionProducts).flatMap(Object.values)),
  );
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
  period: BillingPeriod,
) {
  return products.find((product) => product.identifier === subscriptionProducts[tier][period]);
}
