import { RpcClient, runEnrichmentWorker } from "./worker.ts";
import { extractAppleTrackID, officialPlatformURL } from "./providers.ts";

export type UserClient = RpcClient & {
  auth: {
    getUser: () => PromiseLike<{
      data: { user: { id: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export type HandlerDependencies = {
  adminKey: string;
  authKey: string;
  musicfetchToken?: string | null;
  createAdminClient: () => RpcClient;
  createUserClient: (authorization: string) => UserClient;
  fetcher?: typeof fetch;
};

const MAX_REQUEST_BYTES = 4_096;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export const extractBearerToken = (authorization: string | null) => {
  const match = authorization && /^Bearer ([^\s]+)$/i.exec(authorization);
  const token = match?.[1] ?? null;
  return token && token.length <= 8_192 ? token : null;
};

export const constantTimeEqual = (left: string, right: string) => {
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

const requestBody = async (request: Request) => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) return null;
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null &&
        !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

export const createHandler =
  (dependencies: HandlerDependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const authorization = request.headers.get("authorization");
    const bearer = extractBearerToken(authorization);
    if (!bearer || !authorization) {
      return json({ error: "invalid_session" }, 401);
    }
    const body = await requestBody(request);
    if (!body || typeof body.action !== "string") {
      return json({ error: "invalid_request" }, 400);
    }

    const isWorker = constantTimeEqual(bearer, dependencies.adminKey);
    if (isWorker) {
      if (body.action !== "work") return json({ error: "forbidden" }, 403);
      try {
        const result = await runEnrichmentWorker(
          dependencies.createAdminClient(),
          {
            fetcher: dependencies.fetcher ?? fetch,
            musicfetchToken: dependencies.musicfetchToken,
          },
        );
        return json(result);
      } catch {
        return json({ error: "worker_failed" }, 500);
      }
    }

    if (body.action !== "enqueue") {
      return json({ error: "forbidden" }, 403);
    }
    const userClient = dependencies.createUserClient(authorization);
    const authenticated = await userClient.auth.getUser();
    if (authenticated.error || !authenticated.data.user?.id) {
      return json({ error: "invalid_session" }, 401);
    }
    let targetSongID: string;
    let queued: { data: unknown; error: { message?: string } | null };
    if (typeof body.song_id === "string" && UUID_PATTERN.test(body.song_id)) {
      targetSongID = body.song_id;
      queued = await userClient.rpc("enqueue_song_enrichment", {
        p_song_id: targetSongID,
      });
    } else if (
      typeof body.apple_url === "string" &&
      typeof body.apple_id === "string" &&
      officialPlatformURL("appleMusic", body.apple_url)?.externalID ===
        body.apple_id &&
      extractAppleTrackID(body.apple_url) === body.apple_id
    ) {
      queued = await userClient.rpc("enqueue_song_enrichment_candidate", {
        p_apple_url: body.apple_url,
        p_apple_id: body.apple_id,
      });
      const candidate = typeof queued.data === "object" &&
          queued.data !== null && !Array.isArray(queued.data)
        ? queued.data as Record<string, unknown>
        : null;
      if (
        queued.error || typeof candidate?.song_id !== "string" ||
        !UUID_PATTERN.test(candidate.song_id)
      ) {
        targetSongID = "";
      } else {
        targetSongID = candidate.song_id;
        queued = { data: candidate.queued === true, error: null };
      }
    } else {
      return json({ error: "invalid_target" }, 400);
    }
    if (queued.error) {
      const message = queued.error.message ?? "";
      if (message.includes("rate_limited")) {
        return json({ error: "rate_limited" }, 429);
      }
      if (message.includes("song_not_found")) {
        return json({ error: "song_not_found" }, 404);
      }
      if (message.includes("invalid_apple_track_identity")) {
        return json({ error: "invalid_target" }, 400);
      }
      return json({ error: "enqueue_failed" }, 500);
    }
    if (!targetSongID) return json({ error: "enqueue_failed" }, 500);
    let worker: Record<string, unknown> = { status: "deduplicated" };
    if (queued.data === true) {
      try {
        worker = await runEnrichmentWorker(dependencies.createAdminClient(), {
          fetcher: dependencies.fetcher ?? fetch,
          musicfetchToken: dependencies.musicfetchToken,
          maxJobs: 1,
          targetSongID,
        });
      } catch {
        // L'enqueue est déjà durable. Le client reçoit un état explicite et peut
        // réessayer sans créer de doublon ; le mode worker reprendra aussi la file.
        worker = { status: "queued_for_retry" };
      }
    }
    return json({
      queued: queued.data === true,
      song_id: targetSongID,
      link_resolution: "odesli",
      audio_metrics: dependencies.musicfetchToken
        ? "server_optional"
        : "client_fallback",
      fallback_when_fields_missing: true,
      worker,
    }, 202);
  };
