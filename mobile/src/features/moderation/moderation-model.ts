/**
 * Server-side moderation and rate-limit errors reach the client as PostgREST
 * errors whose `message` is a stable code (raised with a matching sqlstate).
 * This mapper turns them into i18n keys; screens keep their own fallback copy.
 */
export const moderationErrorCodes = [
  'content_not_allowed',
  'rate_limited',
  'account_suspended',
  'account_banned',
] as const;

export type ModerationErrorCode = (typeof moderationErrorCodes)[number];

export type ModerationStatus = 'active' | 'suspended' | 'banned';

export type ModerationState = {
  status: ModerationStatus;
  reason: string | null;
  suspendedUntil: string | null;
  strikes: number;
};

/** Text stored by the server in place of a sanitised chat message. */
export const moderatedMessagePlaceholder = '[message retiré par la modération]';

export const moderationCopyKeys: Record<ModerationErrorCode, string> = {
  account_banned:
    'Ton compte a été fermé pour non-respect des règles de la communauté. Écris à ludovic@dispoapp.net si tu penses qu’il s’agit d’une erreur.',
  account_suspended:
    'Ton compte est suspendu pour le moment. Tu pourras de nouveau publier à la fin de la suspension.',
  content_not_allowed:
    'Ce message ne respecte pas les règles de la communauté. Modifie-le avant de l’envoyer.',
  rate_limited: 'Tu vas un peu vite. Attends un instant avant de réessayer.',
};

/** Copy key shown in place of a message the server sanitised. */
export const moderatedMessageCopyKey = 'Message retiré par la modération';

function errorMessage(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    return typeof message === 'string' ? message : null;
  }
  return null;
}

/** Returns the moderation code carried by a server error, if any. */
export function moderationErrorCode(error: unknown): ModerationErrorCode | null {
  const message = errorMessage(error);
  if (!message) return null;
  return moderationErrorCodes.find((code) => code === message) ?? null;
}

/** i18n key for a moderation error, or `fallbackKey` when the error is unrelated. */
export function moderationErrorCopyKey(error: unknown, fallbackKey: string): string {
  const code = moderationErrorCode(error);
  return code ? moderationCopyKeys[code] : fallbackKey;
}

/** True when the account may not write (suspended or banned). */
export function isAccountWriteBlocked(error: unknown): boolean {
  const code = moderationErrorCode(error);
  return code === 'account_suspended' || code === 'account_banned';
}

/** Parses the payload of `get_my_moderation_state()` defensively. */
export function parseModerationState(value: unknown): ModerationState {
  const fallback: ModerationState = {
    reason: null,
    status: 'active',
    strikes: 0,
    suspendedUntil: null,
  };
  if (typeof value !== 'object' || value === null) return fallback;
  const record = value as Record<string, unknown>;
  const status = record.status;
  return {
    reason: typeof record.reason === 'string' ? record.reason : null,
    status: status === 'suspended' || status === 'banned' ? status : 'active',
    strikes:
      typeof record.strikes === 'number' && Number.isFinite(record.strikes)
        ? Math.max(0, Math.trunc(record.strikes))
        : 0,
    suspendedUntil: typeof record.suspended_until === 'string' ? record.suspended_until : null,
  };
}
