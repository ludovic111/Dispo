import {
  deferredCountAtDeadline,
  isStartedDeliveryAttempt,
  MAX_DELIVERY_ATTEMPTS,
  noEligibleDeviceFailureUpdate,
  shouldFinalizeNotificationAsSent,
} from "./queue_state.ts";

Deno.test("la deadline rend exactement le reste du batch avant provider", () => {
  if (deferredCountAtDeadline(89_999, 90_000, 4, 10) !== 0) {
    throw new Error("le budget disponible ne doit pas differer le batch");
  }
  if (deferredCountAtDeadline(90_000, 90_000, 4, 10) !== 6) {
    throw new Error(
      "la deadline doit rendre la notification courante et la suite",
    );
  }
});

Deno.test("seul un begin atomique confirme autorise le contact fournisseur", () => {
  if (
    !isStartedDeliveryAttempt(1) || !isStartedDeliveryAttempt(3) ||
    isStartedDeliveryAttempt(null) || isStartedDeliveryAttempt(0) ||
    isStartedDeliveryAttempt(4) || isStartedDeliveryAttempt("1")
  ) {
    throw new Error("la decision begin doit rester bornee et fail-closed");
  }
});

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

Deno.test("la finalisation multi-appareils ne masque aucun échec rejouable", () => {
  if (!shouldFinalizeNotificationAsSent(["success", "success"])) {
    throw new Error(
      "des livraisons toutes réussies doivent finaliser la ligne",
    );
  }
  if (!shouldFinalizeNotificationAsSent(["success", "invalid_token"])) {
    throw new Error("un token invalide supprimé ne doit pas forcer un doublon");
  }
  if (
    shouldFinalizeNotificationAsSent(["success", "retryable_failure"]) ||
    shouldFinalizeNotificationAsSent(["retryable_failure"]) ||
    shouldFinalizeNotificationAsSent(["invalid_token"])
  ) {
    throw new Error(
      "timeout, 5xx, exception ou absence de succès doivent rester en retry",
    );
  }
});
