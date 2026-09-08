import { subscriptionStateFromRevenueCat as parse } from "./subscription-state.ts";
const now = Date.parse("2026-09-08T20:00:00Z");
const next = new Date(now + 86400000).toISOString();
const past = new Date(now - 86400000).toISOString();
const group = "ch.dispo.app.group.monthly";
const premium = "ch.dispo.app.premium.annual";
const entry = {
  store: "app_store",
  expires_date: next,
  grace_period_expires_date: null,
  refunded_at: null,
};
const response = (subscriptions: Record<string, unknown>) => ({
  request_date_ms: now,
  subscriber: { subscriptions },
});
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw Error(JSON.stringify({ actual, expected }));
  }
}
Deno.test("Groupe and Premium are separate verified tiers; Premium takes precedence", () => {
  equal(parse(response({})), {
    tier: "free",
    expiresAt: null,
    checkedAtMs: now,
  });
  equal(parse(response({ [group]: entry })), {
    tier: "group",
    expiresAt: next,
    checkedAtMs: now,
  });
  equal(parse(response({ [group]: entry, [premium]: entry })).tier, "premium");
  equal(parse(response({ [premium]: entry, [group]: entry })).tier, "premium");
});
Deno.test("cancelled renewal retains access; refunds and expiry revoke it", () => {
  equal(
    parse(response({ [premium]: { ...entry, unsubscribe_detected_at: past } }))
      .tier,
    "premium",
  );
  equal(
    parse(response({ [premium]: { ...entry, refunded_at: past } })).tier,
    "free",
  );
  equal(
    parse(response({ [premium]: { ...entry, expires_date: past } })).tier,
    "free",
  );
  equal(
    parse(
      response({
        [premium]: { ...entry, expires_date: new Date(now).toISOString() },
      }),
    ).tier,
    "free",
  );
  equal(
    parse(
      response({
        [premium]: {
          ...entry,
          expires_date: past,
          grace_period_expires_date: next,
        },
      }),
    ).tier,
    "premium",
  );
});
Deno.test("unknown products, promotional claims and malformed expiry never grant access", () => {
  equal(parse(response({ "fake.premium": entry })).tier, "free");
  equal(
    parse(response({ [premium]: { ...entry, store: "promotional" } })).tier,
    "free",
  );
  equal(
    parse(response({ [premium]: { ...entry, expires_date: null } })).tier,
    "free",
  );
  for (
    const value of [
      {},
      response({ [premium]: { ...entry, expires_date: "invalid" } }),
      { ...response({}), request_date_ms: NaN },
    ]
  ) {
    let failed = false;
    try {
      parse(value);
    } catch {
      failed = true;
    }
    equal(failed, true);
  }
});
Deno.test("an expired Premium purchase falls back to a currently paid Groupe purchase", () => {
  equal(
    parse(
      response({ [group]: entry, [premium]: { ...entry, expires_date: past } }),
    ).tier,
    "group",
  );
});
