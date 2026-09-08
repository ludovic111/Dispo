export type SubscriptionTier = "free" | "group" | "premium";
export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: string | null;
  checkedAtMs: number;
};
const products: Record<string, Exclude<SubscriptionTier, "free">> = {
  "ch.dispo.app.group.monthly": "group",
  "ch.dispo.app.group.annual": "group",
  "ch.dispo.app.premium.monthly": "premium",
  "ch.dispo.app.premium.annual": "premium",
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timestamp(value: unknown): number {
  if (value == null) return 0;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("invalid_subscription_date");
  }
  return Date.parse(value);
}
/** Only verified App Store subscriptions for our four products grant access.
 * Cancelling renewal keeps access until expiry; refunds revoke it immediately.
 * Sandbox receipts are verified by RevenueCat too, for TestFlight/App Review.
 */
export function subscriptionStateFromRevenueCat(
  value: unknown,
): SubscriptionState {
  if (
    !record(value) || !record(value.subscriber) ||
    !record(value.subscriber.subscriptions)
  ) {
    throw new Error("invalid_subscription_response");
  }
  const checkedAtMs = typeof value.request_date_ms === "number"
    ? value.request_date_ms
    : timestamp(value.request_date);
  if (!Number.isFinite(checkedAtMs) || checkedAtMs <= 0) {
    throw new Error("invalid_subscription_timestamp");
  }
  let tier: SubscriptionTier = "free";
  let expires = 0;
  for (const [id, item] of Object.entries(value.subscriber.subscriptions)) {
    const candidate = products[id];
    if (!candidate) continue;
    if (!record(item)) throw new Error("invalid_subscription_product");
    if (item.store !== "app_store" || item.refunded_at != null) continue;
    // These products always have a finite subscription period. Missing expiry
    // must never turn malformed data into lifetime access.
    const until = Math.max(
      timestamp(item.expires_date),
      timestamp(item.grace_period_expires_date),
    );
    if (until <= checkedAtMs) continue;
    if (tier === "premium" && candidate === "group") continue;
    if (candidate !== tier) expires = 0;
    tier = candidate;
    expires = Math.max(expires, until);
  }
  return {
    tier,
    expiresAt: expires ? new Date(expires).toISOString() : null,
    checkedAtMs,
  };
}
export async function lookupSubscription(
  profileId: string,
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<SubscriptionState> {
  if (!apiKey?.trim()) throw new Error("revenuecat_configuration_missing");
  const response = await fetcher(
    `https://api.revenuecat.com/v1/subscribers/${
      encodeURIComponent(profileId)
    }`,
    {
      headers: {
        authorization: `Bearer ${apiKey.trim()}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`revenuecat_http_${response.status}`);
  return subscriptionStateFromRevenueCat(await response.json());
}
