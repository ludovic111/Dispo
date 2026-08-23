import {
  MAX_DELIVERY_ATTEMPTS,
  noEligibleDeviceFailureUpdate,
} from "./queue_state.ts";

Deno.test("un appareil inéligible termine la file sans simuler un envoi", () => {
  const failedAt = "2026-08-23T11:00:00.000Z";
  const update = noEligibleDeviceFailureUpdate(failedAt);

  if (update.failed_at !== failedAt) {
    throw new Error("failed_at doit refléter l'instant de traitement");
  }
  if (update.attempts !== MAX_DELIVERY_ATTEMPTS) {
    throw new Error("la notification doit atteindre la limite terminale");
  }
  if (update.last_error !== "no_eligible_device") {
    throw new Error("la raison doit rester stable et non sensible");
  }
  if ("sent_at" in update) {
    throw new Error(
      "une notification non livrée ne doit pas être marquée envoyée",
    );
  }
});
