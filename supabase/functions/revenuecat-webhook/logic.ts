export const PREMIUM_ENTITLEMENT = "premium";

export type RevenueCatEvent = {
  id?: string;
  type?: string;
  event_timestamp_ms?: number;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  transferred_from?: string[];
  transferred_to?: string[];
};

export type CanonicalPremiumState = {
  isPremium: boolean;
  checkedAtMs: number;
};

export type PremiumUpdate = CanonicalPremiumState & {
  profileID: string;
};

export type PremiumSyncPlan = {
  updates: PremiumUpdate[];
  shouldRetry: boolean;
  skipped?: string;
  canonicalFailures: number;
};

export type CanonicalPremiumLookup = (
  profileID: string,
) => Promise<CanonicalPremiumState>;

export type PremiumStateWriteResult = "applied" | "stale";

export type PremiumSyncApplication = {
  applied: number;
  stale: number;
};

export type CanonicalPremiumWriter = (
  update: PremiumUpdate,
) => Promise<PremiumStateWriteResult>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PREMIUM_STATE_EVENTS = new Set([
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
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUUIDs(values: unknown[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && UUID_PATTERN.test(value)) {
      unique.add(value.toLowerCase());
    }
  }
  return [...unique];
}

/**
 * RevenueCat peut transférer plusieurs identifiants à la fois. Tous les UUID
 * Supabase sont conservés et les identifiants anonymes RevenueCat sont ignorés.
 */
export function targetProfileIDs(event: RevenueCatEvent): string[] {
  if (event.type === "TRANSFER") {
    return validUUIDs([
      ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
      ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
    ]);
  }

  // Hors transfert, un événement représente un seul Customer RevenueCat.
  // app_user_id reste prioritaire, puis l'identifiant original et ses alias.
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ];
  return validUUIDs(candidates).slice(0, 1);
}

/**
 * Évite qu'un produit explicitement rattaché à un autre entitlement modifie
 * Premium. Quand le champ est absent, seule la lecture canonique peut décider.
 */
export function shouldSyncPremium(event: RevenueCatEvent): boolean {
  if (event.type === "TRANSFER") return true;
  if (!event.type || !PREMIUM_STATE_EVENTS.has(event.type)) return false;

  if (Array.isArray(event.entitlement_ids)) {
    return event.entitlement_ids.includes(PREMIUM_ENTITLEMENT);
  }
  if (event.entitlement_ids === null) return false;

  if (typeof event.entitlement_id === "string") {
    return event.entitlement_id === PREMIUM_ENTITLEMENT;
  }
  if (event.entitlement_id === null) return false;

  // Champ absent : état ambigu. Une lecture RevenueCat est obligatoire ; sans
  // elle buildPremiumSyncPlan produit uniquement des révocations fail-closed.
  return true;
}

function responseTimestamp(payload: Record<string, unknown>): number {
  if (
    typeof payload.request_date_ms === "number" &&
    Number.isFinite(payload.request_date_ms) &&
    payload.request_date_ms > 0
  ) {
    return payload.request_date_ms;
  }

  if (typeof payload.request_date === "string") {
    const parsed = Date.parse(payload.request_date);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("revenuecat_request_date_missing");
}

function optionalDate(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("invalid_revenuecat_date");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("invalid_revenuecat_date");
  return parsed;
}

/**
 * Dérive l'accès exclusivement de l'entitlement canonique nommé `premium`.
 * Les dates RevenueCat (dont une éventuelle grâce) sont comparées à la date de
 * la réponse, ce qui évite de dépendre de l'horloge de l'Edge Function.
 */
export function canonicalPremiumStateFromResponse(
  value: unknown,
): CanonicalPremiumState {
  if (!isRecord(value)) throw new Error("invalid_revenuecat_response");
  const checkedAtMs = responseTimestamp(value);
  if (!isRecord(value.subscriber)) {
    throw new Error("invalid_revenuecat_subscriber");
  }
  if (!isRecord(value.subscriber.entitlements)) {
    throw new Error("invalid_revenuecat_entitlements");
  }

  const entitlement = value.subscriber.entitlements[PREMIUM_ENTITLEMENT];
  if (entitlement === undefined) return { isPremium: false, checkedAtMs };
  if (!isRecord(entitlement)) {
    throw new Error("invalid_premium_entitlement");
  }

  if (!("expires_date" in entitlement)) {
    throw new Error("premium_expiration_missing");
  }
  if (entitlement.expires_date === null) {
    return { isPremium: true, checkedAtMs };
  }

  const expiration = optionalDate(entitlement.expires_date);
  const graceExpiration = optionalDate(entitlement.grace_period_expires_date);
  const activeUntil = Math.max(expiration ?? 0, graceExpiration ?? 0);
  return { isPremium: activeUntil > checkedAtMs, checkedAtMs };
}

/**
 * Les doublons et événements hors ordre relisent toujours RevenueCat : le type
 * du webhook ne décide jamais d'un octroi. Sans lecture canonique (ou si elle
 * échoue), le dernier état connu est conservé et une relance est demandée.
 */
export async function buildPremiumSyncPlan(
  event: RevenueCatEvent,
  canonicalLookup?: CanonicalPremiumLookup,
): Promise<PremiumSyncPlan> {
  if (!shouldSyncPremium(event)) {
    return {
      updates: [],
      shouldRetry: false,
      skipped: "unrelated_event_or_entitlement",
      canonicalFailures: 0,
    };
  }

  const profileIDs = targetProfileIDs(event);
  if (profileIDs.length === 0) {
    return {
      updates: [],
      shouldRetry: false,
      skipped: "anonymous_user",
      canonicalFailures: 0,
    };
  }

  if (!canonicalLookup) {
    return {
      updates: [],
      shouldRetry: true,
      canonicalFailures: profileIDs.length,
    };
  }

  const results = await Promise.all(profileIDs.map(async (profileID) => {
    try {
      const state = await canonicalLookup(profileID);
      if (!Number.isFinite(state.checkedAtMs) || state.checkedAtMs <= 0) {
        throw new Error("invalid_canonical_timestamp");
      }
      return { profileID, ...state };
    } catch {
      return undefined;
    }
  }));

  const updates = results.filter(
    (result): result is PremiumUpdate => result !== undefined,
  );
  const canonicalFailures = profileIDs.length - updates.length;
  return {
    updates,
    shouldRetry: canonicalFailures > 0,
    canonicalFailures,
  };
}

/**
 * Applique chaque état canonique par la même voie, qu'il s'agisse d'un octroi
 * ou d'une révocation. Le writer persistant est responsable de la barrière
 * temporelle atomique et retourne `stale` lorsqu'un état plus récent existe.
 */
export async function applyPremiumSyncPlan(
  plan: PremiumSyncPlan,
  writer: CanonicalPremiumWriter,
): Promise<PremiumSyncApplication> {
  let applied = 0;
  let stale = 0;
  for (const update of plan.updates) {
    const result = await writer(update);
    if (result === "applied") applied += 1;
    else if (result === "stale") stale += 1;
    else throw new Error("invalid_premium_state_write_result");
  }
  return { applied, stale };
}
