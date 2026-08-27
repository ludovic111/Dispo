import {
  buildAPNsDeliveryHeaders,
  buildFCMMessage,
  PROVIDER_REQUEST_TIMEOUT_MS,
  pushDeliveryMetadata,
} from "./providers.ts";

Deno.test("FCM reçoit uniquement des valeurs data textuelles et le canal Dispo", () => {
  const payload = buildFCMMessage(
    "c4hE_bZy0yJB3WfFgxM1WQ",
    {
      id: "11111111-1111-1111-1111-111111111111",
      category: "groups",
      title: "Répétition déplacée",
      body: "La date a changé.",
      data: { group_id: "groupe-1", dates: 2, ignored: null },
      created_at: "2026-08-27T10:00:00.000Z",
    },
    4,
    Date.parse("2026-08-27T10:00:00.000Z"),
  );

  if (payload.message.android.notification.channel_id !== "dispo_alerts") {
    throw new Error("Le canal Android doit rester stable");
  }
  if (payload.message.fid !== "c4hE_bZy0yJB3WfFgxM1WQ") {
    throw new Error(
      "La cible Android doit utiliser le Firebase Installation ID",
    );
  }
  if (payload.message.data.dates !== "2") {
    throw new Error("FCM refuse les valeurs data non textuelles");
  }
  if ("ignored" in payload.message.data) {
    throw new Error("Les valeurs nulles ne doivent pas sortir vers FCM");
  }
  if (
    payload.message.data.notification_id !==
      "11111111-1111-1111-1111-111111111111"
  ) {
    throw new Error(
      "Le deep link doit pouvoir retrouver la notification serveur",
    );
  }
  if (payload.message.android.ttl !== "86400s") {
    throw new Error("FCM doit partir avec l'horizon absolu maximal de 24 h");
  }
  if (
    payload.message.android.collapse_key !==
      "11111111-1111-1111-1111-111111111111"
  ) {
    throw new Error("FCM doit dedupliquer une reprise de la meme alerte");
  }
  if (
    payload.message.android.notification.tag !==
      "11111111-1111-1111-1111-111111111111"
  ) {
    throw new Error("Android doit remplacer l'affichage du meme evenement");
  }
});

Deno.test("APNs et FCM partagent une expiration absolue depuis created_at", () => {
  const notification = {
    id: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-08-27T10:00:00.000Z",
  };
  const createdAt = Date.parse(notification.created_at);
  const headers = buildAPNsDeliveryHeaders(notification, createdAt + 5_000);
  const expectedExpiration = Math.floor(createdAt / 1_000) + 86_400;

  if (headers["apns-id"] !== notification.id) {
    throw new Error("apns-id doit rester stable entre les reprises");
  }
  if (headers["apns-collapse-id"] !== notification.id) {
    throw new Error("APNs doit replier les doublons de la meme notification");
  }
  if (headers["apns-expiration"] !== String(expectedExpiration)) {
    throw new Error("APNs ne doit jamais repousser la fenetre a chaque essai");
  }

  const expired = pushDeliveryMetadata(notification, createdAt + 86_401_000);
  if (expired.remainingTTLSeconds !== 0) {
    throw new Error("une alerte de plus de 24 h ne doit plus etre envoyee");
  }
  if (PROVIDER_REQUEST_TIMEOUT_MS !== 10_000) {
    throw new Error("chaque appel fournisseur doit rester borne a 10 secondes");
  }
});
