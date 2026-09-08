import { createClient } from "@supabase/supabase-js";
import { lookupSubscription } from "../_shared/subscription-state.ts";

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
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const url = environment("SUPABASE_URL");
    const key = environment("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "configuration_missing" }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: { user }, error } = await admin.auth.getUser(
      authorization.slice(7),
    );
    if (error || !user) return json({ error: "unauthorized" }, 401);
    // The caller supplies neither a profile ID, a tier nor a purchase receipt.
    // Only a live RevenueCat response for the authenticated UUID is trusted.
    try {
      const state = await lookupSubscription(
        user.id,
        environment("REVENUECAT_API_KEY"),
        fetcher,
      );
      const result = await admin.rpc("apply_revenuecat_subscription_state", {
        p_profile_id: user.id,
        p_tier: state.tier,
        p_expires_at: state.expiresAt,
        p_checked_at: new Date(state.checkedAtMs).toISOString(),
      });
      if (result.error) throw new Error("subscription_sync_failed");
      return json({ ok: true });
    } catch {
      // Keep the previous verified state and let the SDK/user retry.
      return json({ error: "subscription_sync_unavailable", retry: true }, 503);
    }
  };
}
if (import.meta.main) Deno.serve(createHandler());
