import { buildFCMMessage } from "./providers.ts";

Deno.test("FCM reçoit uniquement des valeurs data textuelles et le canal Dispo", () => {
  const payload = buildFCMMessage(
    "c4hE_bZy0yJB3WfFgxM1WQ",
    {
      id: "11111111-1111-1111-1111-111111111111",
      category: "groups",
      title: "Répétition déplacée",
      body: "La date a changé.",
      data: { group_id: "groupe-1", dates: 2, ignored: null },
    },
    4,
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
});
