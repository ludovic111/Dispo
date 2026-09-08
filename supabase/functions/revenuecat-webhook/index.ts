// RevenueCat notifications trigger a canonical lookup; event payloads never grant access.
import { createClient } from "@supabase/supabase-js";
import { lookupSubscription } from "../_shared/subscription-state.ts";
import { type RevenueCatEvent, targetProfileIDs } from "./logic.ts";

const events = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "CANCELLATION",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_PAUSED",
  "EXPIRATION",
  "BILLING_ISSUE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "REFUND_REVERSED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "PURCHASE_REDEEMED",
  "SUBSCRIBER_ALIAS",
  "TRANSFER",
]);
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
export function createHandler(
  environment: (name: string) => string | undefined = Deno.env.get,
  fetcher: typeof fetch = fetch,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const secret = environment("REVENUECAT_WEBHOOK_SECRET");
    if (!secret) return json({ error: "webhook_secret_missing" }, 503);
    const authorization = req.headers.get("authorization") ?? "";
    if (authorization !== secret && authorization !== `Bearer ${secret}`) {
      return json({ error: "unauthorized" }, 401);
    }
    let event: RevenueCatEvent | undefined;
    try {
      event = (await req.json())?.event;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (event?.type === "TEST") return json({ ok: true, test: true });
    if (
      !event?.type || !event.id ||
      typeof event.event_timestamp_ms !== "number" ||
      !Number.isFinite(event.event_timestamp_ms) ||
      event.event_timestamp_ms <= 0
    ) return json({ error: "invalid_event" }, 400);
    if (!events.has(event.type)) {
      return json({ ok: true, skipped: "unrelated_event" });
    }
    const ids = targetProfileIDs(event);
    if (!ids.length) return json({ ok: true, skipped: "anonymous_user" });
    const url = environment("SUPABASE_URL");
    const key = environment("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "configuration_missing" }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    let applied = 0;
    let failures = 0;
    for (const profileId of ids) {
      try {
        // Deleted accounts are deliberately ignored, not recreated by a renewal.
        const profile = await admin.from("profiles").select("id").eq(
          "id",
          profileId,
        ).maybeSingle();
        if (profile.error) throw profile.error;
        if (!profile.data) continue;
        const state = await lookupSubscription(
          profileId,
          environment("REVENUECAT_API_KEY"),
          fetcher,
        );
        const result = await admin.rpc("apply_revenuecat_subscription_state", {
          p_profile_id: profileId,
          p_tier: state.tier,
          p_expires_at: state.expiresAt,
          p_checked_at: new Date(state.checkedAtMs).toISOString(),
        });
        if (result.error) throw result.error;
        if (result.data === true) applied += 1;
      } catch {
        failures += 1;
      }
    }
    return failures
      ? json({
        error: "subscription_sync_incomplete",
        retry: true,
        failures,
        applied,
      }, 503)
      : json({ ok: true, applied });
  };
}
if (import.meta.main) Deno.serve(createHandler());
