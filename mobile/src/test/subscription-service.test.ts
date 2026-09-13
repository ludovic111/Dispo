import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Purchases, { type PurchasesStoreProduct } from 'react-native-purchases';

import {
  loadStoreProducts,
  purchaseSubscription,
  restoreSubscriptions,
  storefrontProductIds,
  subscriptionProducts,
  subscriptionStateFromResponse,
} from '@/features/premium/subscription-service';
import { getSupabaseClient } from '@/services/supabase/client';
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(),
    configure: jest.fn(),
    getAppUserID: jest.fn(),
    logIn: jest.fn(),
    getProducts: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));
jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
const A = '55000000-0000-4000-8000-000000000001';
const B = '55000000-0000-4000-8000-000000000002';
let currentUser = A;
const invoke = jest.fn(async () => ({ error: null }));
const rpc = jest.fn(async () => ({
  data: { tier: 'group', expires_at: '2099-09-10T20:00:00Z', group_count: 0 },
  error: null,
}));
beforeEach(() => {
  jest.clearAllMocks();
  currentUser = A;
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: { getSession: async () => ({ data: { session: { user: { id: currentUser } } } }) },
    functions: { invoke },
    rpc,
  } as unknown as ReturnType<typeof getSupabaseClient>);
  jest.mocked(Purchases.isConfigured).mockResolvedValue(true);
  jest.mocked(Purchases.getAppUserID).mockResolvedValue(A);
  jest.mocked(Purchases.getProducts).mockResolvedValue([]);
});
describe('StoreKit identity and server verification', () => {
  it('requests only the two monthly product IDs without using a locally invented price', async () => {
    await loadStoreProducts(A);
    expect(Purchases.getProducts).toHaveBeenCalledWith([
      'ch.dispo.app.group.monthly',
      'ch.dispo.app.premium.monthly',
    ]);
    expect([...storefrontProductIds]).toEqual([
      subscriptionProducts.group.monthly,
      subscriptionProducts.premium.monthly,
    ]);
    expect(storefrontProductIds).not.toContain(subscriptionProducts.premium.annual);
  });
  it('does not start checkout when the account changes during RevenueCat login', async () => {
    jest.mocked(Purchases.getAppUserID).mockResolvedValue(B);
    jest.mocked(Purchases.logIn).mockImplementation(async () => {
      currentUser = B;
      return {} as Awaited<ReturnType<typeof Purchases.logIn>>;
    });
    await expect(
      purchaseSubscription(A, {
        identifier: 'ch.dispo.app.group.monthly',
      } as PurchasesStoreProduct),
    ).rejects.toThrow('purchase_session_changed');
    expect(Purchases.purchaseStoreProduct).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('keeps a cancelled purchase from granting or syncing access', async () => {
    jest.mocked(Purchases.purchaseStoreProduct).mockRejectedValue({ userCancelled: true });
    await expect(purchaseSubscription(A, {} as PurchasesStoreProduct)).rejects.toEqual({
      userCancelled: true,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('returns restored rights from the server rather than the SDK cache', async () => {
    jest
      .mocked(Purchases.restorePurchases)
      .mockResolvedValue({} as Awaited<ReturnType<typeof Purchases.restorePurchases>>);
    await expect(restoreSubscriptions(A)).resolves.toMatchObject({
      tier: 'group',
      groupCount: 0,
      source: 'store',
    });
    expect(invoke).toHaveBeenCalledWith('sync-subscription');
    expect(rpc).toHaveBeenCalledWith('get_my_subscription');
  });
  it('rejects malformed server responses', () => {
    for (const value of [
      null,
      {},
      { tier: 'admin', group_count: 0 },
      { tier: 'group', group_count: -1 },
      { tier: 'group', group_count: NaN },
    ])
      expect(() => subscriptionStateFromResponse(value)).toThrow('invalid_subscription_state');
  });
  it('reads school grants and workshop schools from the server', () => {
    const state = subscriptionStateFromResponse({
      tier: 'premium',
      source: 'school_grant',
      expires_at: '2027-01-31T22:59:59Z',
      school_short_name: 'AMR',
      upcoming_school_grant: null,
      group_count: 2,
      workshop_group_count: 1,
      workshop_schools: [
        { school_id: 'school-1', school_short_name: 'AMR', free_workshops_until: '2028-12-31' },
        { school_id: null, school_short_name: 'Broken' },
      ],
    });
    expect(state).toEqual({
      tier: 'premium',
      source: 'school_grant',
      expiresAt: '2027-01-31T22:59:59Z',
      schoolShortName: 'AMR',
      upcomingSchoolGrant: null,
      groupCount: 2,
      workshopGroupCount: 1,
      workshopSchools: [
        { freeWorkshopsUntil: '2028-12-31', schoolId: 'school-1', schoolShortName: 'AMR' },
      ],
    });
    const upcoming = subscriptionStateFromResponse({
      tier: 'free',
      source: 'none',
      expires_at: null,
      school_short_name: null,
      upcoming_school_grant: {
        school_short_name: 'AMR',
        starts_at: '2026-09-30T22:00:00Z',
        ends_at: '2027-01-31T22:59:59Z',
      },
      group_count: 0,
    });
    expect(upcoming.upcomingSchoolGrant).toEqual({
      endsAt: '2027-01-31T22:59:59Z',
      schoolShortName: 'AMR',
      startsAt: '2026-09-30T22:00:00Z',
    });
    expect(upcoming.workshopSchools).toEqual([]);
    // Older server responses (before the source field) still parse.
    expect(subscriptionStateFromResponse({ tier: 'premium', group_count: 1 })).toMatchObject({
      source: 'store',
      schoolShortName: null,
      workshopGroupCount: 0,
    });
  });
});
