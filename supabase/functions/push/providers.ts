import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

export type PushPlatform = "ios" | "android";

export type ProviderDevice = {
  token: string;
  platform: PushPlatform;
  environment: "development" | "production";
};

export type ProviderNotification = {
  id: string;
  category: "sos" | "messages" | "groups";
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export type ProviderResult = {
  ok: boolean;
  status: number;
  details: string;
  invalidToken: boolean;
  provider: "APNs" | "FCM";
};

type CachedToken = { value: string; expiresAt: number };

let cachedAPNsToken: CachedToken | undefined;
let cachedGoogleToken: CachedToken | undefined;

const requiredEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
};

const normalizedPrivateKey = (name: string) =>
  requiredEnvironment(name).replaceAll("\\n", "\n");

async function apnsProviderToken() {
  if (cachedAPNsToken && cachedAPNsToken.expiresAt > Date.now() + 5 * 60_000) {
    return cachedAPNsToken.value;
  }

  const teamID = requiredEnvironment("APNS_TEAM_ID");
  const keyID = requiredEnvironment("APNS_KEY_ID");
  const key = await importPKCS8(
    normalizedPrivateKey("APNS_PRIVATE_KEY"),
    "ES256",
  );
  const issuedAt = Math.floor(Date.now() / 1_000);
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyID })
    .setIssuer(teamID)
    .setIssuedAt(issuedAt)
    .sign(key);

  cachedAPNsToken = { value, expiresAt: (issuedAt + 55 * 60) * 1_000 };
  return value;
}

async function googleAccessToken() {
  if (
    cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 5 * 60_000
  ) {
    return cachedGoogleToken.value;
  }

  const clientEmail = requiredEnvironment("FCM_CLIENT_EMAIL");
  const key = await importPKCS8(
    normalizedPrivateKey("FCM_PRIVATE_KEY"),
    "RS256",
  );
  const issuedAt = Math.floor(Date.now() / 1_000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3_600)
    .sign(key);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(`fcm_oauth_failed:${payload.error ?? response.status}`);
  }

  cachedGoogleToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3_600) * 1_000,
  };
  return payload.access_token;
}

const fcmData = (notification: ProviderNotification) => {
  const result: Record<string, string> = {
    category: notification.category,
    notification_id: notification.id,
  };
  for (const [key, value] of Object.entries(notification.data ?? {})) {
    if (value === null || value === undefined) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
};

export const buildFCMMessage = (
  installationID: string,
  notification: ProviderNotification,
  badgeCount: number,
) => ({
  message: {
    fid: installationID,
    notification: { title: notification.title, body: notification.body },
    data: fcmData(notification),
    android: {
      priority: "high",
      notification: {
        channel_id: "dispo_alerts",
        default_sound: true,
        notification_count: Math.min(999, Math.max(0, badgeCount)),
      },
    },
  },
});

async function sendToAPNs(
  device: ProviderDevice,
  notification: ProviderNotification,
  badgeCount: number,
): Promise<ProviderResult> {
  const host = device.environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
  const token = await apnsProviderToken();
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
  return {
    ok: response.ok,
    status: response.status,
    details,
    invalidToken: response.status === 410 ||
      details.includes("BadDeviceToken") ||
      details.includes("Unregistered"),
    provider: "APNs",
  };
}

async function sendToFCM(
  device: ProviderDevice,
  notification: ProviderNotification,
  badgeCount: number,
): Promise<ProviderResult> {
  const projectID = requiredEnvironment("FCM_PROJECT_ID");
  const token = await googleAccessToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectID}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(
        buildFCMMessage(device.token, notification, badgeCount),
      ),
    },
  );
  const details = response.ok ? "" : await response.text();
  return {
    ok: response.ok,
    status: response.status,
    details,
    invalidToken: details.includes('"errorCode": "UNREGISTERED"') ||
      details.includes('"errorCode":"UNREGISTERED"') ||
      (response.status === 404 && details.includes('"status": "NOT_FOUND"')) ||
      (response.status === 404 && details.includes('"status":"NOT_FOUND"')),
    provider: "FCM",
  };
}

export const sendToPushProvider = (
  device: ProviderDevice,
  notification: ProviderNotification,
  badgeCount: number,
) =>
  device.platform === "android"
    ? sendToFCM(device, notification, badgeCount)
    : sendToAPNs(device, notification, badgeCount);
