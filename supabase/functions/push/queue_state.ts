export const MAX_DELIVERY_ATTEMPTS = 3;
export const PUSH_PROCESSING_BUDGET_MS = 90_000;

export type DeviceDeliveryDisposition =
  | "success"
  | "invalid_token"
  | "retryable_failure";

/**
 * Une notification n'est considérée livrée que si au moins un appareil a
 * réussi et qu'aucun autre appareil n'a rencontré une erreur susceptible de
 * réussir au prochain essai. Un token définitivement invalide, supprimé de la
 * base par l'appelant, ne doit pas provoquer un doublon sur les appareils déjà
 * servis.
 */
export const shouldFinalizeNotificationAsSent = (
  dispositions: readonly DeviceDeliveryDisposition[],
) =>
  dispositions.includes("success") &&
  !dispositions.includes("retryable_failure");

export const isStartedDeliveryAttempt = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 &&
  value <= MAX_DELIVERY_ATTEMPTS;

export const deferredCountAtDeadline = (
  nowMilliseconds: number,
  deadlineMilliseconds: number,
  currentIndex: number,
  totalCount: number,
) =>
  nowMilliseconds >= deadlineMilliseconds
    ? Math.max(0, totalCount - currentIndex)
    : 0;

/**
 * Termine une notification qu'aucun appareil ne peut recevoir. `sent_at`
 * reste volontairement absent : la ligne demeure visible dans le centre
 * in-app sans prétendre qu'un fournisseur push l'a livrée.
 */
export const noEligibleDeviceFailureUpdate = (failedAt: string) => ({
  failed_at: failedAt,
  attempts: MAX_DELIVERY_ATTEMPTS,
  last_error: "no_eligible_device",
});
