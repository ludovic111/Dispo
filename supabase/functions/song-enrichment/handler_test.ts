import {
  constantTimeEqual,
  createHandler,
  extractBearerToken,
  UserClient,
} from "./handler.ts";
import { RpcClient, RpcResult } from "./worker.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const parse = async (response: Response) =>
  await response.json() as Record<string, unknown>;

class HandlerRPC implements RpcClient {
  calls: Array<{ name: string; parameters?: Record<string, unknown> }> = [];
  constructor(
    private readonly responder: (
      name: string,
      parameters?: Record<string, unknown>,
    ) => RpcResult,
  ) {}
  rpc(name: string, parameters?: Record<string, unknown>) {
    this.calls.push({ name, parameters });
    return Promise.resolve(this.responder(name, parameters));
  }
}

const userClient = (
  valid: boolean,
  enqueue: RpcResult = { data: true, error: null },
): UserClient => ({
  auth: {
    getUser: () =>
      Promise.resolve({
        data: { user: valid ? { id: "user-1" } : null },
        error: valid ? null : { message: "invalid" },
      }),
  },
  rpc: () => Promise.resolve(enqueue),
});

const adminForEmptyWorker = () =>
  new HandlerRPC((name) => {
    if (name === "claim_song_enrichment_jobs") return { data: [], error: null };
    if (name === "release_song_enrichment_claim") {
      return { data: 0, error: null };
    }
    return { data: null, error: { message: "unexpected" } };
  });

const request = (
  token: string,
  body: Record<string, unknown>,
  method = "POST",
) =>
  new Request("https://example.test/song-enrichment", {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

Deno.test("l'extraction Bearer et la comparaison worker sont strictes", () => {
  assert(extractBearerToken("Bearer abc.def") === "abc.def", "Bearer valide");
  assert(extractBearerToken("Basic abc") === null, "Basic doit être refusé");
  assert(constantTimeEqual("service-key", "service-key"), "clés identiques");
  assert(!constantTimeEqual("service-key", "service-kez"), "clés différentes");
  assert(!constantTimeEqual("short", "shorter"), "longueurs différentes");
});

Deno.test("un JWT valide enqueue puis lance automatiquement le worker ciblé", async () => {
  const admin = adminForEmptyWorker();
  const handler = createHandler({
    adminKey: "service-role-secret",
    authKey: "publishable-key",
    musicfetchToken: null,
    createAdminClient: () => admin,
    createUserClient: () => userClient(true),
    fetcher: () => Promise.resolve(new Response()),
  });
  const songID = "11111111-1111-4111-8111-111111111111";
  const response = await handler(request("valid-user-jwt", {
    action: "enqueue",
    song_id: songID,
  }));
  const body = await parse(response);
  assert(response.status === 202, "l'enqueue doit être accepté");
  assert(body.queued === true, "la demande doit être mise en file");
  assert(body.audio_metrics === "client_fallback", "statut fallback explicite");
  assert(typeof body.worker === "object", "le résumé worker doit être renvoyé");
  const claim = admin.calls.find((call) =>
    call.name === "claim_song_enrichment_jobs"
  );
  assert(claim?.parameters?.p_song_id === songID, "le worker doit être ciblé");
  assert(claim?.parameters?.p_limit === 1, "un enqueue traite un seul morceau");
});

Deno.test("une sélection Apple crée une identité candidate sans métadonnées client", async () => {
  const candidateID = "22222222-2222-4222-8222-222222222222";
  let candidateParameters: Record<string, unknown> | undefined;
  const candidateUser: UserClient = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
    },
    rpc: (name, parameters) => {
      assert(
        name === "enqueue_song_enrichment_candidate",
        "la RPC candidate est attendue",
      );
      candidateParameters = parameters;
      return Promise.resolve({
        data: { song_id: candidateID, queued: true },
        error: null,
      });
    },
  };
  const admin = adminForEmptyWorker();
  const handler = createHandler({
    adminKey: "service-role-secret",
    authKey: "publishable-key",
    createAdminClient: () => admin,
    createUserClient: () => candidateUser,
  });
  const response = await handler(request("valid-user-jwt", {
    action: "enqueue",
    apple_id: "871146601",
    apple_url:
      "https://music.apple.com/ch/album/oye-como-va/871146591?i=871146601",
    title: "Ne doit jamais atteindre SQL",
  }));
  const body = await parse(response);
  assert(response.status === 202, "la candidate Apple doit être acceptée");
  assert(body.song_id === candidateID, "l'UUID canonique doit être renvoyé");
  assert(
    !Object.hasOwn(candidateParameters ?? {}, "p_title"),
    "aucune métadonnée libre ne doit atteindre la RPC",
  );
  const claim = admin.calls.find((call) =>
    call.name === "claim_song_enrichment_jobs"
  );
  assert(claim?.parameters?.p_song_id === candidateID, "worker candidat ciblé");
});

Deno.test("un enqueue dédupliqué ne relance pas le worker", async () => {
  let adminCreated = false;
  const handler = createHandler({
    adminKey: "service-role-secret",
    authKey: "publishable-key",
    createAdminClient: () => {
      adminCreated = true;
      return adminForEmptyWorker();
    },
    createUserClient: () => userClient(true, { data: false, error: null }),
  });
  const response = await handler(request("valid-user-jwt", {
    action: "enqueue",
    song_id: "11111111-1111-4111-8111-111111111111",
  }));
  const body = await parse(response);
  assert(response.status === 202 && body.queued === false, "doublon accepté");
  assert(!adminCreated, "le doublon ne doit pas consommer un claim");
});

Deno.test("un JWT invalide ne peut ni enqueue ni lancer le worker", async () => {
  let adminCreated = false;
  const handler = createHandler({
    adminKey: "service-role-secret",
    authKey: "publishable-key",
    createAdminClient: () => {
      adminCreated = true;
      return adminForEmptyWorker();
    },
    createUserClient: () => userClient(false),
  });
  const response = await handler(request("invalid-user-jwt", {
    action: "enqueue",
    song_id: "11111111-1111-4111-8111-111111111111",
  }));
  assert(response.status === 401, "la session invalide doit être refusée");
  assert(!adminCreated, "aucun client admin ne doit être créé avant Auth");
});

Deno.test("les portées user et service-role ne sont jamais interchangeables", async () => {
  const handler = createHandler({
    adminKey: "service-role-secret",
    authKey: "publishable-key",
    createAdminClient: adminForEmptyWorker,
    createUserClient: () => userClient(true),
  });
  const userWork = await handler(request("valid-user-jwt", { action: "work" }));
  assert(
    userWork.status === 403,
    "un utilisateur ne lance pas le worker global",
  );
  const workerEnqueue = await handler(request("service-role-secret", {
    action: "enqueue",
    song_id: "11111111-1111-4111-8111-111111111111",
  }));
  assert(
    workerEnqueue.status === 403,
    "service-role ne prend pas le chemin user",
  );
  const workerRun = await handler(request("service-role-secret", {
    action: "work",
  }));
  assert(workerRun.status === 200, "service-role peut relancer la file bornée");
});

Deno.test("le rate limit utilisateur devient HTTP 429 sans fuite SQL", async () => {
  const handler = createHandler({
    adminKey: "service-role-secret",
    authKey: "publishable-key",
    createAdminClient: adminForEmptyWorker,
    createUserClient: () =>
      userClient(true, {
        data: null,
        error: { message: "song_enrichment_rate_limited" },
      }),
  });
  const response = await handler(request("valid-user-jwt", {
    action: "enqueue",
    song_id: "11111111-1111-4111-8111-111111111111",
  }));
  const body = await parse(response);
  assert(response.status === 429, "le débit user doit être visible en 429");
  assert(body.error === "rate_limited", "le détail SQL ne doit pas fuiter");
});

Deno.test("un body sans Content-Length reste borné en lecture", async () => {
  let userCreated = false;
  const handler = createHandler({
    adminKey: "service-role-secret",
    authKey: "publishable-key",
    createAdminClient: adminForEmptyWorker,
    createUserClient: () => {
      userCreated = true;
      return userClient(true);
    },
  });
  const response = await handler(
    new Request(
      "https://example.test/song-enrichment",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-user-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "enqueue", padding: "x".repeat(5_000) }),
      },
    ),
  );
  assert(response.status === 400, "un body trop gros doit être rejeté");
  assert(!userCreated, "Auth ne doit pas être appelée après rejet du body");
});
