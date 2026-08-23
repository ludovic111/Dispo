export const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Termine une notification qu'aucun appareil ne peut recevoir. `sent_at`
 * reste volontairement absent : la ligne demeure visible dans le centre
 * in-app sans prétendre qu'APNs l'a livrée.
 */
export const noEligibleDeviceFailureUpdate = (failedAt: string) => ({
  failed_at: failedAt,
  attempts: MAX_DELIVERY_ATTEMPTS,
  last_error: "no_eligible_device",
});
