// Webhook RevenueCat → profiles.is_premium.
// Seule voie d'écriture du statut Premium en base (le trigger
// protect_premium_flag neutralise les clients). Déployée avec
// verify_jwt = false : RevenueCat ne porte pas de JWT Supabase,
// l'authentification se fait par le secret partagé configuré dans le
// dashboard RevenueCat (Integrations → Webhooks → Authorization header)
// et dans les secrets Supabase (REVENUECAT_WEBHOOK_SECRET).

import { createClient } from "npm:@supabase/supabase-js@2";

type RevenueCatEvent = {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  transferred_from?: string[];
  transferred_to?: string[];
};

const PREMIUM_ENTITLEMENT = "premium";

// Événements qui rendent l'entitlement actif. CANCELLATION (désabonnement)
// et BILLING_ISSUE laissent l'accès actif jusqu'à EXPIRATION — on ne touche
// à rien avant.
const ACTIVATING = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
]);
const DEACTIVATING = new Set(["EXPIRATION"]);

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/// L'app_user_id RevenueCat est l'UUID Supabase (Purchases.logIn côté app).
/// Les identifiants anonymes ($RCAnonymousID:…) sont ignorés.
function profileID(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate && UUID_PATTERN.test(candidate)) return candidate.toLowerCase();
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook_secret_missing" }, 500);
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
  if (!event?.type) return json({ error: "missing_event" }, 400);
  if (event.type === "TEST") return json({ ok: true, test: true });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const setPremium = async (id: string, isPremium: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_premium: isPremium })
      .eq("id", id);
    if (error) throw new Error(error.message);
  };

  try {
    // Transfert d'abonnement entre comptes : l'ancien perd, le nouveau gagne.
    if (event.type === "TRANSFER") {
      const from = profileID(...(event.transferred_from ?? []));
      const to = profileID(...(event.transferred_to ?? []));
      if (from) await setPremium(from, false);
      if (to) await setPremium(to, true);
      return json({ ok: true, from: from ?? null, to: to ?? null });
    }

    // Hors transfert : seul l'entitlement « premium » nous intéresse.
    if (event.entitlement_ids && !event.entitlement_ids.includes(PREMIUM_ENTITLEMENT)) {
      return json({ ok: true, skipped: "other_entitlement" });
    }

    const id = profileID(event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []));
    if (!id) return json({ ok: true, skipped: "anonymous_user" });

    if (ACTIVATING.has(event.type)) {
      await setPremium(id, true);
      return json({ ok: true, premium: true });
    }
    if (DEACTIVATING.has(event.type)) {
      await setPremium(id, false);
      return json({ ok: true, premium: false });
    }
    return json({ ok: true, skipped: event.type });
  } catch (error) {
    // 500 → RevenueCat réessaie automatiquement.
    return json({ error: String(error) }, 500);
  }
});
