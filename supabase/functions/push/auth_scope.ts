export const PUSH_BATCH_LIMIT = 10;
export const USER_QUEUE_LOOKBACK_MS = 10 * 60 * 1_000;

const MAX_BEARER_TOKEN_LENGTH = 4_096;

export type AuthorizationScope =
  | { kind: "user"; actorID: string }
  | { kind: "worker" };

export type PendingQueueScope = {
  actorID: string | null;
  createdSince: string | null;
  limit: number;
};

export type BearerCredentialRoute = "user" | "worker";

/**
 * Extrait uniquement un jeton Bearer unique. Les JWT utilisateur sont d'abord
 * validés par Supabase Auth ; cette extraction sert ensuite au repli worker.
 */
export const extractBearerToken = (authorization: string | null) => {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  const token = match?.[1];
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH) return null;
  return token;
};

/**
 * Le token Vault du worker est toujours un hex lowercase de 32 octets. Cette
 * forme ne peut pas etre un JWT Supabase : on evite ainsi de transmettre le
 * secret interne a GoTrue et on n'essaie jamais Vault apres un JWT invalide.
 */
export const bearerCredentialRoute = (
  token: string,
): BearerCredentialRoute => /^[0-9a-f]{64}$/.test(token) ? "worker" : "user";

/**
 * La session utilisateur gagne toujours. Le mode worker n'est accordé que si
 * la RPC serveur privée a rendu exactement `true`.
 */
export const decideAuthorizationScope = (
  userID: string | null | undefined,
  workerTokenVerified: boolean,
): AuthorizationScope | null => {
  if (userID) return { kind: "user", actorID: userID };
  if (workerTokenVerified) return { kind: "worker" };
  return null;
};

/**
 * Les appels utilisateur conservent la fenêtre et le filtre actor_id
 * historiques. Le worker balaie toute la file, mais par lots strictement
 * bornés afin de limiter le temps d'exécution et les appels fournisseurs.
 */
export const pendingQueueScope = (
  authorization: AuthorizationScope,
  nowMilliseconds: number,
): PendingQueueScope =>
  authorization.kind === "user"
    ? {
      actorID: authorization.actorID,
      createdSince: new Date(
        nowMilliseconds - USER_QUEUE_LOOKBACK_MS,
      ).toISOString(),
      limit: PUSH_BATCH_LIMIT,
    }
    : {
      actorID: null,
      createdSince: null,
      limit: PUSH_BATCH_LIMIT,
    };
