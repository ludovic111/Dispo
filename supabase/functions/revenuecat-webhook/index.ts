// Webhook RevenueCat → profiles.is_premium.
// Seule voie d'écriture du statut Premium en base (le trigger
// protect_premium_flag neutralise les clients). Déployée avec
// verify_jwt = false : RevenueCat ne porte pas de JWT Supabase,
// l'authentification se fait par le secret partagé configuré dans le
// dashboard RevenueCat (Integrations → Webhooks → Authorization header)
// et dans les secrets Supabase (REVENUECAT_WEBHOOK_SECRET).
// REVENUECAT_API_KEY contient la clé SDK publique existante : elle permet de
// relire GET /subscribers. Sans elle, le traitement ne mute rien et répond 503.

import { createClient } from "@supabase/supabase-js";
import {
  applyPremiumSyncPlan,
  buildPremiumSyncPlan,
  type CanonicalPremiumLookup,
  canonicalPremiumStateFromResponse,
  type RevenueCatEvent,
} from "./logic.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(
    JSON.stringify(body),
    { status, headers: { "content-type": "application/json" } },
  );

function isValidEvent(event: RevenueCatEvent): boolean {
  return typeof event.type === "string" && event.type.length > 0 &&
    typeof event.id === "string" && event.id.length > 0 &&
    typeof event.event_timestamp_ms === "number" &&
    Number.isFinite(event.event_timestamp_ms) &&
    event.event_timestamp_ms > 0;
}

function canonicalLookup(
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): CanonicalPremiumLookup | undefined {
  const normalizedAPIKey = apiKey?.trim();
  if (!normalizedAPIKey) return undefined;

  return async (profileID) => {
    const response = await fetcher(
      `https://api.revenuecat.com/v1/subscribers/${
        encodeURIComponent(profileID)
      }`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${normalizedAPIKey}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new Error(`revenuecat_http_${response.status}`);
    }
    return canonicalPremiumStateFromResponse(await response.json());
  };
}

type PremiumDatabase = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          is_premium: boolean;
          updated_at: string;
        };
        Insert: {
          id: string;
          is_premium?: boolean;
          updated_at?: string;
        };
        Update: {
          is_premium?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_revenuecat_premium_state: {
        Args: {
          p_profile_id: string;
          p_is_premium: boolean;
          p_checked_at: string;
        };
        Returns: boolean;
      };
    };
  };
};

export function createHandler(
  environment: (name: string) => string | undefined = Deno.env.get,
  fetcher: typeof fetch = fetch,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const secret = environment("REVENUECAT_WEBHOOK_SECRET");
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
    if (event?.type === "TEST") return json({ ok: true, test: true });
    if (!event || !isValidEvent(event)) {
      return json({ error: "invalid_event" }, 400);
    }

    const supabaseURL = environment("SUPABASE_URL");
    const serviceRoleKey = environment("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseURL || !serviceRoleKey) {
      return json({ error: "supabase_configuration_missing" }, 500);
    }

    const supabase = createClient<PremiumDatabase>(
      supabaseURL,
      serviceRoleKey,
    );
    const lookup = canonicalLookup(
      environment("REVENUECAT_API_KEY"),
      fetcher,
    );

    try {
      const plan = await buildPremiumSyncPlan(event, lookup);
      if (plan.skipped) {
        return json({ ok: true, skipped: plan.skipped });
      }

      const application = await applyPremiumSyncPlan(plan, async (update) => {
        const { data, error } = await supabase.rpc(
          "apply_revenuecat_premium_state",
          {
            p_profile_id: update.profileID,
            p_is_premium: update.isPremium,
            p_checked_at: new Date(update.checkedAtMs).toISOString(),
          },
        );
        if (error) throw new Error("profile_premium_sync_failed");
        if (data === true) return "applied";
        if (data === false) return "stale";
        throw new Error("invalid_profile_premium_sync_response");
      });
      if (plan.shouldRetry) {
        console.error("RevenueCat premium sync incomplete", {
          eventID: event.id,
          eventType: event.type,
          canonicalFailures: plan.canonicalFailures,
          applied: application.applied,
          stale: application.stale,
        });
        return json({
          error: "premium_sync_incomplete",
          retry: true,
          canonical_failures: plan.canonicalFailures,
          applied_profiles: application.applied,
          stale_profiles_ignored: application.stale,
        }, 503);
      }

      return json({
        ok: true,
        premium_profiles_synced: application.applied,
        stale_profiles_ignored: application.stale,
      });
    } catch (error) {
      console.error("RevenueCat premium sync failed", {
        eventID: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      // Une réponse non-2xx demande à RevenueCat de rejouer l'événement.
      return json({ error: "premium_sync_failed", retry: true }, 500);
    }
  };
}

if (import.meta.main) Deno.serve(createHandler());
