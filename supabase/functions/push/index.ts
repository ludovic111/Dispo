import { createClient } from "npm:@supabase/supabase-js@2";
import {
  deferredCountAtDeadline,
  isStartedDeliveryAttempt,
  noEligibleDeviceFailureUpdate,
  PUSH_PROCESSING_BUDGET_MS,
  shouldFinalizeNotificationAsSent,
} from "./queue_state.ts";
import {
  ProviderResult,
  PushPlatform,
  sendToPushProvider,
} from "./providers.ts";
import {
  AuthorizationScope,
  bearerCredentialRoute,
  decideAuthorizationScope,
  extractBearerToken,
  pendingQueueScope,
} from "./auth_scope.ts";
import { resolveSupabaseRuntimeKeys } from "./runtime_keys.ts";

type PushNotification = {
  id: string;
  user_id: string;
  category: "sos" | "messages" | "groups";
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
  created_at: string;
};

type PushDevice = {
  token: string;
  user_id: string;
  platform: PushPlatform;
  environment: "development" | "production";
  sos_enabled: boolean;
  messages_enabled: boolean;
  groups_enabled: boolean;
  last_seen_at: string;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(
    JSON.stringify(body),
    { status, headers: { "content-type": "application/json" } },
  );

const preferenceAllows = (
  device: PushDevice,
  category: PushNotification["category"],
) => {
  if (category === "sos") return device.sos_enabled;
  if (category === "messages") return device.messages_enabled;
  return device.groups_enabled;
};

Deno.serve(async (request) => {
  const processingDeadline = Date.now() + PUSH_PROCESSING_BUDGET_MS;
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "missing_authorization" }, 401);
  const bearerToken = extractBearerToken(authorization);
  if (!bearerToken) return json({ error: "invalid_session" }, 401);
  const credentialRoute = bearerCredentialRoute(bearerToken);

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const { adminKey, authKey } = resolveSupabaseRuntimeKeys({
    SUPABASE_SECRET_KEYS: Deno.env.get("SUPABASE_SECRET_KEYS"),
    SUPABASE_PUBLISHABLE_KEYS: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_SECRET_KEY: Deno.env.get("SUPABASE_SECRET_KEY"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_PUBLISHABLE_KEY: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
  });
  if (
    !supabaseURL || !adminKey ||
    (credentialRoute === "user" && !authKey)
  ) {
    return json({ error: "supabase_configuration_missing" }, 503);
  }

  const admin = createClient(supabaseURL, adminKey, {
    auth: { persistSession: false },
  });
  let authorizationScope: AuthorizationScope | null;
  if (credentialRoute === "worker") {
    // `verify_push_worker_token` est privée et exécutable uniquement avec la
    // service role. Toute erreur (RPC absente, Vault indisponible, jeton faux)
    // reste un refus générique : verify_jwt=false ne crée ainsi aucun chemin
    // anonyme vers la file globale.
    const { data: workerVerified, error: workerError } = await admin.rpc(
      "verify_push_worker_token",
      { p_token: bearerToken },
    );
    authorizationScope = decideAuthorizationScope(
      null,
      !workerError && workerVerified === true,
    );
  } else {
    if (!authKey) return json({ error: "supabase_configuration_missing" }, 503);
    const authClient = createClient(supabaseURL, authKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth
      .getUser();
    authorizationScope = decideAuthorizationScope(
      authError ? null : user?.id,
      false,
    );
  }
  if (!authorizationScope) {
    return json({ error: "invalid_session" }, 401);
  }

  const queueScope = pendingQueueScope(authorizationScope, Date.now());
  const batchClaimID = crypto.randomUUID();
  const { data: claimedData, error: pendingError } = await admin.rpc(
    "claim_pending_push_notifications",
    {
      p_claim_id: batchClaimID,
      p_actor_id: queueScope.actorID,
      p_created_since: queueScope.createdSince,
      p_limit: queueScope.limit,
    },
  );
  if (pendingError) return json({ error: "queue_claim_failed" }, 500);
  const pending = claimedData as PushNotification[] | null;
  if (!pending?.length) return json({ sent: 0, failed: 0, skipped: 0 });

  const releaseUnprocessedClaims = () =>
    admin.rpc("release_push_notification_claim", {
      p_claim_id: batchClaimID,
    });

  const userIDs = [...new Set(pending.map((item) => item.user_id))];
  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select(
      "token,user_id,platform,environment,sos_enabled,messages_enabled,groups_enabled,last_seen_at",
    )
    .in("user_id", userIDs)
    .eq("notifications_enabled", true)
    .order("last_seen_at", { ascending: false })
    .returns<PushDevice[]>();
  if (deviceError) {
    const { error: releaseError } = await releaseUnprocessedClaims();
    if (releaseError) return json({ error: "queue_release_failed" }, 500);
    return json({ error: "device_read_failed" }, 500);
  }

  const { data: unreadRows, error: unreadError } = await admin
    .from("push_notifications")
    .select("user_id")
    .in("user_id", userIDs)
    .is("read_at", null);
  if (unreadError) {
    const { error: releaseError } = await releaseUnprocessedClaims();
    if (releaseError) return json({ error: "queue_release_failed" }, 500);
    return json({ error: "badge_count_failed" }, 500);
  }
  const unreadByUser = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    unreadByUser.set(row.user_id, (unreadByUser.get(row.user_id) ?? 0) + 1);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let claimLost = 0;
  let deferred = 0;
  const sentByProvider = { ios: 0, android: 0 };
  for (const [notificationIndex, notification] of pending.entries()) {
    const deferredNow = deferredCountAtDeadline(
      Date.now(),
      processingDeadline,
      notificationIndex,
      pending.length,
    );
    if (deferredNow > 0) {
      const { error: releaseError } = await releaseUnprocessedClaims();
      if (releaseError) return json({ error: "queue_release_failed" }, 500);
      deferred += deferredNow;
      break;
    }

    const recipients = (devices ?? []).filter(
      (device) =>
        device.user_id === notification.user_id &&
        preferenceAllows(device, notification.category),
    ).slice(0, 10);
    if (!recipients.length) {
      // Aucun appareil ne peut recevoir cette alerte (notifications coupées,
      // catégorie désactivée ou token absent). C'est un échec terminal :
      // la ligne reste disponible dans le centre in-app, mais ne doit plus
      // revenir indéfiniment dans la file de livraison.
      const { data: terminalUpdated, error: terminalUpdateError } = await admin
        .from("push_notifications")
        .update({
          ...noEligibleDeviceFailureUpdate(new Date().toISOString()),
          delivery_claim_id: null,
          delivery_claimed_at: null,
        })
        .eq("id", notification.id)
        .eq("delivery_claim_id", batchClaimID)
        .select("id")
        .maybeSingle();
      if (terminalUpdateError) {
        const { error: releaseError } = await releaseUnprocessedClaims();
        if (releaseError) return json({ error: "queue_release_failed" }, 500);
        return json({ error: "queue_update_failed" }, 500);
      }
      if (!terminalUpdated) {
        claimLost += 1;
        continue;
      }
      skipped += 1;
      continue;
    }

    const { data: startedAttempt, error: attemptError } = await admin.rpc(
      "begin_push_notification_attempt",
      {
        p_notification_id: notification.id,
        p_claim_id: batchClaimID,
      },
    );
    if (attemptError) {
      const { error: releaseError } = await releaseUnprocessedClaims();
      if (releaseError) return json({ error: "queue_release_failed" }, 500);
      return json({ error: "queue_attempt_failed" }, 500);
    }
    if (!isStartedDeliveryAttempt(startedAttempt)) {
      claimLost += 1;
      continue;
    }

    let delivered = false;
    const deliveredPlatforms: PushPlatform[] = [];
    const deliveryDispositions = [] as Array<
      "success" | "invalid_token" | "retryable_failure"
    >;
    let lastError = "";
    const outcomes = await Promise.all(recipients.map(async (device) => {
      try {
        const result: ProviderResult = await sendToPushProvider(
          device,
          notification,
          unreadByUser.get(notification.user_id) ?? 1,
        );
        return { device, result, error: "" };
      } catch (error) {
        return {
          device,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }));
    for (const outcome of outcomes) {
      if (!outcome.result) {
        lastError = outcome.error;
        deliveryDispositions.push("retryable_failure");
        continue;
      }
      if (outcome.result.ok) {
        delivered = true;
        deliveredPlatforms.push(outcome.device.platform);
        deliveryDispositions.push("success");
        continue;
      }
      const providerError =
        `${outcome.result.provider} ${outcome.result.status}: ${outcome.result.details}`
          .slice(0, 500);
      if (outcome.result.invalidToken) {
        if (!lastError) lastError = providerError;
        deliveryDispositions.push("invalid_token");
        await admin.from("push_devices").delete().eq(
          "token",
          outcome.device.token,
        );
      } else {
        lastError = providerError;
        deliveryDispositions.push("retryable_failure");
      }
    }

    if (
      delivered && shouldFinalizeNotificationAsSent(deliveryDispositions)
    ) {
      const { data: sentUpdated, error: sentUpdateError } = await admin.from(
        "push_notifications",
      )
        .update({
          sent_at: new Date().toISOString(),
          failed_at: null,
          last_error: null,
          delivery_claim_id: null,
          delivery_claimed_at: null,
        })
        .eq("id", notification.id)
        .eq("delivery_claim_id", batchClaimID)
        .select("id")
        .maybeSingle();
      if (sentUpdateError) {
        return json({ error: "queue_update_failed" }, 500);
      }
      if (!sentUpdated) {
        claimLost += 1;
        continue;
      }
      sent += 1;
      for (const platform of deliveredPlatforms) {
        sentByProvider[platform] += 1;
      }
    } else {
      const { data: failedUpdated, error: failedUpdateError } = await admin
        .from(
          "push_notifications",
        ).update({
          failed_at: new Date().toISOString(),
          last_error: lastError.slice(0, 500),
          delivery_claim_id: null,
          delivery_claimed_at: null,
        })
        .eq("id", notification.id)
        .eq("delivery_claim_id", batchClaimID)
        .select("id")
        .maybeSingle();
      if (failedUpdateError) {
        return json({ error: "queue_update_failed" }, 500);
      }
      if (!failedUpdated) {
        claimLost += 1;
        continue;
      }
      failed += 1;
    }
  }

  return json({
    sent,
    failed,
    skipped,
    claim_lost: claimLost,
    deferred,
    sent_by_provider: sentByProvider,
  });
});
