import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MAX_DELIVERY_ATTEMPTS,
  noEligibleDeviceFailureUpdate,
} from "./queue_state.ts";
import {
  ProviderResult,
  PushPlatform,
  sendToPushProvider,
} from "./providers.ts";

type PushNotification = {
  id: string;
  user_id: string;
  category: "sos" | "messages" | "groups";
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
};

type PushDevice = {
  token: string;
  user_id: string;
  platform: PushPlatform;
  environment: "development" | "production";
  sos_enabled: boolean;
  messages_enabled: boolean;
  groups_enabled: boolean;
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
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "missing_authorization" }, 401);

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEYS.default");
  if (!supabaseURL || !anonKey || !serviceKey) {
    return json({ error: "supabase_configuration_missing" }, 503);
  }

  const authClient = createClient(supabaseURL, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "invalid_session" }, 401);

  const admin = createClient(supabaseURL, serviceKey, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
  const { data: pending, error: pendingError } = await admin
    .from("push_notifications")
    .select("id,user_id,category,title,body,data,attempts")
    .eq("actor_id", user.id)
    .is("sent_at", null)
    .lt("attempts", MAX_DELIVERY_ATTEMPTS)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<PushNotification[]>();
  if (pendingError) return json({ error: "queue_read_failed" }, 500);
  if (!pending?.length) return json({ sent: 0, failed: 0, skipped: 0 });

  const userIDs = [...new Set(pending.map((item) => item.user_id))];
  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select(
      "token,user_id,platform,environment,sos_enabled,messages_enabled,groups_enabled",
    )
    .in("user_id", userIDs)
    .eq("notifications_enabled", true)
    .returns<PushDevice[]>();
  if (deviceError) return json({ error: "device_read_failed" }, 500);

  const { data: unreadRows, error: unreadError } = await admin
    .from("push_notifications")
    .select("user_id")
    .in("user_id", userIDs)
    .is("read_at", null);
  if (unreadError) return json({ error: "badge_count_failed" }, 500);
  const unreadByUser = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    unreadByUser.set(row.user_id, (unreadByUser.get(row.user_id) ?? 0) + 1);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const sentByProvider = { ios: 0, android: 0 };
  for (const notification of pending) {
    const recipients = (devices ?? []).filter(
      (device) =>
        device.user_id === notification.user_id &&
        preferenceAllows(device, notification.category),
    );
    if (!recipients.length) {
      // Aucun appareil ne peut recevoir cette alerte (notifications coupées,
      // catégorie désactivée ou token absent). C'est un échec terminal :
      // la ligne reste disponible dans le centre in-app, mais ne doit plus
      // revenir indéfiniment dans la file de livraison.
      const { error: terminalUpdateError } = await admin
        .from("push_notifications")
        .update(noEligibleDeviceFailureUpdate(new Date().toISOString()))
        .eq("id", notification.id);
      if (terminalUpdateError) {
        return json({ error: "queue_update_failed" }, 500);
      }
      skipped += 1;
      continue;
    }

    let delivered = false;
    let lastError = "";
    for (const device of recipients) {
      try {
        const result: ProviderResult = await sendToPushProvider(
          device,
          notification,
          unreadByUser.get(notification.user_id) ?? 1,
        );
        if (result.ok) {
          delivered = true;
          sentByProvider[device.platform] += 1;
        } else {
          lastError = `${result.provider} ${result.status}: ${result.details}`
            .slice(0, 500);
          if (result.invalidToken) {
            await admin.from("push_devices").delete().eq("token", device.token);
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (delivered) {
      sent += 1;
      const { error: sentUpdateError } = await admin.from("push_notifications")
        .update({
          sent_at: new Date().toISOString(),
          attempts: notification.attempts + 1,
          last_error: null,
        }).eq("id", notification.id);
      if (sentUpdateError) return json({ error: "queue_update_failed" }, 500);
    } else {
      failed += 1;
      const { error: failedUpdateError } = await admin.from(
        "push_notifications",
      ).update({
        failed_at: new Date().toISOString(),
        attempts: notification.attempts + 1,
        last_error: lastError.slice(0, 500),
      }).eq("id", notification.id);
      if (failedUpdateError) return json({ error: "queue_update_failed" }, 500);
    }
  }

  return json({ sent, failed, skipped, sent_by_provider: sentByProvider });
});
