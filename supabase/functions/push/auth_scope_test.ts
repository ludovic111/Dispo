import {
  bearerCredentialRoute,
  decideAuthorizationScope,
  extractBearerToken,
  pendingQueueScope,
  PUSH_BATCH_LIMIT,
} from "./auth_scope.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("le Bearer worker est extrait sans accepter de format ambigu", () => {
  assert(
    extractBearerToken("Bearer worker-token_123") === "worker-token_123",
    "un Bearer standard doit être extrait",
  );
  assert(
    extractBearerToken("bearer worker-token_123") === "worker-token_123",
    "le schéma Authorization est insensible à la casse",
  );
  assert(extractBearerToken(null) === null, "l'en-tête reste obligatoire");
  assert(
    extractBearerToken("Basic worker-token_123") === null,
    "un autre schéma d'authentification doit être rejeté",
  );
  assert(
    extractBearerToken("Bearer token autre") === null,
    "plusieurs valeurs ne doivent jamais être confondues avec un jeton",
  );
  assert(
    extractBearerToken("Bearer ") === null,
    "un Bearer vide doit être rejeté",
  );
});

Deno.test("le routage Bearer separe strictement JWT et worker", () => {
  assert(
    bearerCredentialRoute("a".repeat(64)) === "worker",
    "le token Vault hex lowercase doit aller uniquement vers la RPC",
  );
  assert(
    bearerCredentialRoute("A".repeat(64)) === "user",
    "une forme non canonique ne doit jamais atteindre Vault",
  );
  assert(
    bearerCredentialRoute("eyJhbGciOiJIUzI1NiJ9.payload.signature") === "user",
    "un JWT doit aller uniquement vers Supabase Auth",
  );
});

Deno.test("la session utilisateur valide garde la priorité et son actor_id", () => {
  const scope = decideAuthorizationScope("user-a", true);
  assert(scope?.kind === "user", "le JWT utilisateur doit rester prioritaire");
  assert(
    scope?.kind === "user" && scope.actorID === "user-a",
    "la portée doit reprendre l'identité Auth validée",
  );
});

Deno.test("le worker est fail-closed tant que sa RPC ne confirme pas le jeton", () => {
  assert(
    decideAuthorizationScope(null, false) === null,
    "un jeton refusé ne doit obtenir aucune portée",
  );
  assert(
    decideAuthorizationScope(undefined, false) === null,
    "une erreur ou absence de vérification doit rester refusée",
  );
  assert(
    decideAuthorizationScope(null, true)?.kind === "worker",
    "seul un résultat RPC exactement vrai doit ouvrir le mode worker",
  );
});

Deno.test("la portée utilisateur conserve actor_id et la fenêtre historique", () => {
  const now = Date.parse("2026-08-27T12:10:00.000Z");
  const scope = pendingQueueScope(
    { kind: "user", actorID: "user-a" },
    now,
  );

  assert(scope.actorID === "user-a", "actor_id doit rester obligatoire");
  assert(
    scope.createdSince === "2026-08-27T12:00:00.000Z",
    "la fenêtre utilisateur de dix minutes doit rester inchangée",
  );
  assert(scope.limit === PUSH_BATCH_LIMIT, "le lot doit rester borné");
});

Deno.test("la portée worker est globale mais strictement bornée", () => {
  const scope = pendingQueueScope({ kind: "worker" }, Date.now());
  assert(scope.actorID === null, "le worker ne filtre pas sur un acteur");
  assert(
    scope.createdSince === null,
    "le worker doit pouvoir reprendre une notification ancienne non livrée",
  );
  assert(scope.limit === 10, "le worker ne traite jamais plus de 10 lignes");
});
