import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

type PushNotification = {
  id: string;
  user_id: string;
  category: "sos" | "messages" | "groups";
  title: string;
  body: string;
  data: Record<string, string>;
  attempts: number;
};

type PushDevice = {
  token: string;
  user_id: string;
  environment: "development" | "production";
  sos_enabled: boolean;
  messages_enabled: boolean;
  groups_enabled: boolean;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

const preferenceAllows = (device: PushDevice, category: PushNotification["category"]) => {
  if (category === "sos") return device.sos_enabled;
  if (category === "messages") return device.messages_enabled;
  return device.groups_enabled;
};

let cachedProviderToken: { value: string; createdAt: number } | undefined;

async function providerToken() {
  if (cachedProviderToken && Date.now() - cachedProviderToken.createdAt < 45 * 60 * 1_000) {
    return cachedProviderToken.value;
  }
  const teamID = Deno.env.get("APNS_TEAM_ID")!;
  const keyID = Deno.env.get("APNS_KEY_ID")!;
  const rawKey = Deno.env.get("APNS_PRIVATE_KEY")!.replaceAll("\\n", "\n");
  const key = await importPKCS8(rawKey, "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyID })
    .setIssuer(teamID)
    .setIssuedAt()
    .sign(key);
  cachedProviderToken = { value, createdAt: Date.now() };
  return value;
}

async function sendToAPNs(
  device: PushDevice,
  notification: PushNotification,
  badgeCount: number,
) {
  const host = device.environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
  const token = await providerToken();
  const response = await fetch(`${host}/3/device/${device.token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "apns-topic": Deno.env.get("APNS_BUNDLE_ID") ?? "ch.dispo.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1_000) + 86_400),
    },
    body: JSON.stringify({
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: "default",
        badge: Math.min(999, Math.max(0, badgeCount)),
        category: notification.category,
      },
      ...notification.data,
      notification_id: notification.id,
    }),
  });
  const details = response.ok ? "" : await response.text();
  return { ok: response.ok, status: response.status, details };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "missing_authorization" }, 401);

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SECRET_KEYS.default");
  if (!supabaseURL || !anonKey || !serviceKey) {
    return json({ error: "supabase_configuration_missing" }, 503);
  }

  const authClient = createClient(supabaseURL, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "invalid_session" }, 401);

  if (!Deno.env.get("APNS_TEAM_ID") || !Deno.env.get("APNS_KEY_ID") || !Deno.env.get("APNS_PRIVATE_KEY")) {
    return json({ error: "apns_configuration_missing" }, 503);
  }

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
  const { data: pending, error: pendingError } = await admin
    .from("push_notifications")
    .select("id,user_id,category,title,body,data,attempts")
    .eq("actor_id", user.id)
    .is("sent_at", null)
    .lt("attempts", 3)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<PushNotification[]>();
  if (pendingError) return json({ error: "queue_read_failed" }, 500);
  if (!pending?.length) return json({ sent: 0, failed: 0, skipped: 0 });

  const userIDs = [...new Set(pending.map((item) => item.user_id))];
  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("token,user_id,environment,sos_enabled,messages_enabled,groups_enabled")
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
  for (const notification of pending) {
    const recipients = (devices ?? []).filter(
      (device) => device.user_id === notification.user_id && preferenceAllows(device, notification.category),
    );
    if (!recipients.length) {
      skipped += 1;
      continue;
    }

    let delivered = false;
    let lastError = "";
    for (const device of recipients) {
      try {
        const result = await sendToAPNs(
          device,
          notification,
          unreadByUser.get(notification.user_id) ?? 1,
        );
        if (result.ok) {
          delivered = true;
        } else {
          lastError = `APNs ${result.status}: ${result.details}`.slice(0, 500);
          if (result.status === 410 || result.details.includes("BadDeviceToken") || result.details.includes("Unregistered")) {
            await admin.from("push_devices").delete().eq("token", device.token);
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (delivered) {
      sent += 1;
      await admin.from("push_notifications").update({
        sent_at: new Date().toISOString(),
        attempts: notification.attempts + 1,
        last_error: null,
      }).eq("id", notification.id);
    } else {
      failed += 1;
      await admin.from("push_notifications").update({
        failed_at: new Date().toISOString(),
        attempts: notification.attempts + 1,
        last_error: lastError.slice(0, 500),
      }).eq("id", notification.id);
    }
  }

  return json({ sent, failed, skipped });
});
