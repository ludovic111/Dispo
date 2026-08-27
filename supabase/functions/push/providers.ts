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
  created_at: string;
};

export type ProviderResult = {
  ok: boolean;
  status: number;
  details: string;
  invalidToken: boolean;
  provider: "APNs" | "FCM";
};

type CachedToken = { value: string; expiresAt: number };

export const PUSH_DELIVERY_WINDOW_SECONDS = 86_400;
export const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;

let cachedAPNsToken: CachedToken | undefined;
let cachedGoogleToken: CachedToken | undefined;
let googleAccessTokenPromise: Promise<string> | undefined;

const requiredEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
};

const normalizedPrivateKey = (name: string) =>
  requiredEnvironment(name).replaceAll("\\n", "\n");

export const pushDeliveryMetadata = (
  notification: Pick<ProviderNotification, "id" | "created_at">,
  nowMilliseconds = Date.now(),
) => {
  const createdMilliseconds = Date.parse(notification.created_at);
  const expiresAtEpochSeconds = Number.isFinite(createdMilliseconds)
    ? Math.floor(createdMilliseconds / 1_000) + PUSH_DELIVERY_WINDOW_SECONDS
    : 0;
  const remainingTTLSeconds = Math.max(
    0,
    Math.min(
      PUSH_DELIVERY_WINDOW_SECONDS,
      expiresAtEpochSeconds - Math.floor(nowMilliseconds / 1_000),
    ),
  );
  return {
    collapseID: notification.id,
    expiresAtEpochSeconds,
    remainingTTLSeconds,
  };
};

export const buildAPNsDeliveryHeaders = (
  notification: Pick<ProviderNotification, "id" | "created_at">,
  nowMilliseconds = Date.now(),
) => {
  const metadata = pushDeliveryMetadata(notification, nowMilliseconds);
  return {
    "apns-id": metadata.collapseID,
    "apns-collapse-id": metadata.collapseID,
    "apns-expiration": String(metadata.expiresAtEpochSeconds),
  };
};

const expiredProviderResult = (
  provider: ProviderResult["provider"],
): ProviderResult => ({
  ok: false,
  status: 410,
  details: "delivery_window_expired",
  invalidToken: false,
  provider,
});

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

async function refreshGoogleAccessToken() {
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
    signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
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
  return cachedGoogleToken.value;
}

async function googleAccessToken() {
  if (
    cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 5 * 60_000
  ) {
    return cachedGoogleToken.value;
  }

  googleAccessTokenPromise ??= refreshGoogleAccessToken();
  try {
    return await googleAccessTokenPromise;
  } finally {
    googleAccessTokenPromise = undefined;
  }
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
  nowMilliseconds = Date.now(),
) => {
  const delivery = pushDeliveryMetadata(notification, nowMilliseconds);
  return ({
    message: {
      fid: installationID,
      notification: { title: notification.title, body: notification.body },
      data: fcmData(notification),
      android: {
        priority: "high",
        ttl: `${delivery.remainingTTLSeconds}s`,
        collapse_key: delivery.collapseID,
        notification: {
          channel_id: "dispo_alerts",
          default_sound: true,
          notification_count: Math.min(999, Math.max(0, badgeCount)),
          tag: delivery.collapseID,
        },
      },
    },
  });
};

async function sendToAPNs(
  device: ProviderDevice,
  notification: ProviderNotification,
  badgeCount: number,
): Promise<ProviderResult> {
  const delivery = pushDeliveryMetadata(notification);
  if (delivery.remainingTTLSeconds <= 0) {
    return expiredProviderResult("APNs");
  }
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
      ...buildAPNsDeliveryHeaders(notification),
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
    signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
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
  const delivery = pushDeliveryMetadata(notification);
  if (delivery.remainingTTLSeconds <= 0) {
    return expiredProviderResult("FCM");
  }
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
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
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
