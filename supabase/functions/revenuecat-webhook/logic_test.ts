import {
  applyPremiumSyncPlan,
  buildPremiumSyncPlan,
  canonicalPremiumStateFromResponse,
  type RevenueCatEvent,
  shouldSyncPremium,
  targetProfileIDs,
} from "./logic.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const CHECKED_AT = Date.parse("2026-08-27T12:00:00Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nattendu=${JSON.stringify(expected)}\nobtenu=${
        JSON.stringify(actual)
      }`,
    );
  }
}

function event(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: "event-1",
    type: "RENEWAL",
    event_timestamp_ms: CHECKED_AT,
    app_user_id: A,
    entitlement_ids: ["premium"],
    ...overrides,
  };
}

function response(
  entitlements: Record<string, unknown>,
  requestDateMs = CHECKED_AT,
) {
  return {
    request_date_ms: requestDateMs,
    subscriber: { entitlements },
  };
}

Deno.test("TRANSFER traite tous les UUID source et destination", () => {
  const ids = targetProfileIDs(event({
    type: "TRANSFER",
    transferred_from: [A, "$RCAnonymousID:source", B, A.toUpperCase()],
    transferred_to: [C, "invalide", D],
  }));

  assertEquals(
    ids,
    [A, B, C, D],
    "les UUID doivent être dédupliqués sans perte",
  );
});

Deno.test("un autre entitlement ne peut jamais déclencher la synchronisation Premium", () => {
  assert(
    !shouldSyncPremium(event({ entitlement_ids: ["pro", "teacher"] })),
    "un produit sans premium doit être ignoré",
  );
  assert(
    !shouldSyncPremium(event({ entitlement_ids: null })),
    "un produit non rattaché doit être ignoré",
  );
  assert(
    shouldSyncPremium(event({ entitlement_ids: ["pro", "premium"] })),
    "premium peut coexister avec un autre entitlement",
  );
});

Deno.test("seul l'entitlement canonique premium accorde l'accès", () => {
  const otherOnly = canonicalPremiumStateFromResponse(response({
    pro: { expires_date: null },
  }));
  assert(
    !otherOnly.isPremium,
    "un entitlement lifetime nommé pro ne suffit pas",
  );

  const premium = canonicalPremiumStateFromResponse(response({
    pro: { expires_date: null },
    premium: { expires_date: "2026-09-27T12:00:00Z" },
  }));
  assert(premium.isPremium, "premium non expiré doit être actif");

  const lifetime = canonicalPremiumStateFromResponse(response({
    premium: { expires_date: null },
  }));
  assert(lifetime.isPremium, "premium lifetime doit être actif");
});

Deno.test("expiration et grâce RevenueCat sont évaluées à la date canonique", () => {
  const expired = canonicalPremiumStateFromResponse(response({
    premium: { expires_date: "2026-08-26T12:00:00Z" },
  }));
  assert(!expired.isPremium, "un premium expiré doit être révoqué");

  const grace = canonicalPremiumStateFromResponse(response({
    premium: {
      expires_date: "2026-08-26T12:00:00Z",
      grace_period_expires_date: "2026-08-28T12:00:00Z",
    },
  }));
  assert(grace.isPremium, "la période de grâce active doit être respectée");
});

Deno.test("sans lecture canonique le plan conserve l'état connu et demande une relance", async () => {
  const plan = await buildPremiumSyncPlan(event(), undefined);

  assert(plan.shouldRetry, "RevenueCat doit rejouer l'événement");
  assertEquals(
    plan.canonicalFailures,
    1,
    "la lecture absente est un échec canonique",
  );
  assertEquals(
    plan.updates,
    [],
    "aucun payload seul ne doit muter Premium",
  );
});

Deno.test("un payload sans entitlement_ids ne peut pas accorder Premium", async () => {
  const plan = await buildPremiumSyncPlan(event({
    entitlement_ids: undefined,
    entitlement_id: undefined,
  }));

  assert(plan.shouldRetry, "le payload ambigu doit attendre l'état canonique");
  assertEquals(
    plan.updates,
    [],
    "l'absence du champ ne doit jamais être interprétée comme une preuve",
  );
});

Deno.test("un transfert sans état canonique conserve tous les états connus", async () => {
  const plan = await buildPremiumSyncPlan(event({
    type: "TRANSFER",
    transferred_from: [A, B],
    transferred_to: [C, D],
  }));

  assert(plan.shouldRetry, "un transfert ambigu doit être rejoué");
  assertEquals(
    plan.canonicalFailures,
    4,
    "chaque UUID doit être compté pour la relance",
  );
  assertEquals(
    plan.updates,
    [],
    "aucun profil du transfert ne doit être révoqué sans preuve",
  );
});

Deno.test("doublons et événements hors ordre convergent vers le même état canonique", async () => {
  const lookup = () =>
    Promise.resolve({ isPremium: false, checkedAtMs: CHECKED_AT });
  const renewal = event({
    id: "older-renewal",
    event_timestamp_ms: CHECKED_AT - 10_000,
  });
  const expiration = event({
    id: "newer-expiration",
    type: "EXPIRATION",
    event_timestamp_ms: CHECKED_AT,
  });

  const plans = await Promise.all([
    buildPremiumSyncPlan(renewal, lookup),
    buildPremiumSyncPlan(expiration, lookup),
    buildPremiumSyncPlan(renewal, lookup),
  ]);
  for (const plan of plans) {
    assertEquals(
      plan.updates,
      [{ profileID: A, isPremium: false, checkedAtMs: CHECKED_AT }],
      "le type, l'ordre et le doublon ne doivent pas remplacer l'état canonique",
    );
  }
});

Deno.test("une panne canonique partielle conserve le profil en échec", async () => {
  const transfer = event({
    type: "TRANSFER",
    transferred_from: [A],
    transferred_to: [B],
  });
  const plan = await buildPremiumSyncPlan(transfer, (profileID) => {
    if (profileID === B) return Promise.reject(new Error("network_failure"));
    return Promise.resolve({ isPremium: true, checkedAtMs: CHECKED_AT });
  });

  assert(plan.shouldRetry, "l'échec partiel doit demander un rejeu");
  assertEquals(plan.canonicalFailures, 1, "un seul lookup doit être en échec");
  assertEquals(
    plan.updates,
    [{ profileID: A, isPremium: true, checkedAtMs: CHECKED_AT }],
    "le profil sans preuve canonique doit garder son dernier état",
  );
});

Deno.test("un timeout RevenueCat ne produit aucune mutation", async () => {
  const plan = await buildPremiumSyncPlan(
    event(),
    () => Promise.reject(new DOMException("timeout", "TimeoutError")),
  );

  assert(plan.shouldRetry, "le timeout doit demander un rejeu");
  assertEquals(
    plan.canonicalFailures,
    1,
    "le lookup doit être compté en échec",
  );
  assertEquals(
    plan.updates,
    [],
    "le last-known-good ne doit pas être écrasé pendant une panne",
  );
});

Deno.test("octrois et révocations utilisent la même barrière temporelle", async () => {
  const writes: Array<
    { profileID: string; isPremium: boolean; checkedAtMs: number }
  > = [];
  const plan = {
    updates: [
      { profileID: A, isPremium: true, checkedAtMs: CHECKED_AT },
      { profileID: B, isPremium: false, checkedAtMs: CHECKED_AT - 1_000 },
    ],
    shouldRetry: false,
    canonicalFailures: 0,
  };

  const application = await applyPremiumSyncPlan(plan, (update) => {
    writes.push(update);
    return Promise.resolve(update.isPremium ? "applied" : "stale");
  });

  assertEquals(
    writes,
    plan.updates,
    "la révocation doit conserver son horodatage canonique",
  );
  assertEquals(
    application,
    { applied: 1, stale: 1 },
    "un état ancien ignoré n'est ni une erreur ni un nouvel octroi",
  );
});
