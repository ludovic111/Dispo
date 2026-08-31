import { EnrichmentJob } from "./providers.ts";
import { RpcClient, RpcResult, runEnrichmentWorker } from "./worker.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const testJob = (overrides: Partial<EnrichmentJob> = {}): EnrichmentJob => ({
  song_id: "11111111-1111-4111-8111-111111111111",
  title: "Test",
  artist: "Artist",
  isrc: "USRC17607839",
  apple_id: null,
  apple_url: null,
  attempt_number: 1,
  ...overrides,
});

class MockRPC implements RpcClient {
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

const musicfetchResponse = () => ({
  result: {
    type: "track",
    isrc: "USRC17607839",
    audioMetrics: { tempo: 99.7, key: 9, mode: 0 },
    services: {
      spotify: {
        id: "3n3Ppam7vgaVa1iaRUc9Lp",
        link: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
      },
    },
  },
});

Deno.test("le worker ciblé claim un seul morceau et persiste audioMetrics", async () => {
  let completedPayload: unknown;
  const client = new MockRPC((name, parameters) => {
    if (name === "claim_song_enrichment_jobs") {
      return { data: [testJob()], error: null };
    }
    if (name === "reserve_song_enrichment_provider_call") {
      return { data: true, error: null };
    }
    if (name === "complete_song_enrichment_job") {
      completedPayload = parameters?.p_result as Record<string, unknown>;
      return { data: true, error: null };
    }
    if (name === "release_song_enrichment_claim") {
      return { data: 0, error: null };
    }
    return { data: null, error: { message: "unexpected" } };
  });
  const summary = await runEnrichmentWorker(client, {
    fetcher: () =>
      Promise.resolve(
        new Response(JSON.stringify(musicfetchResponse()), {
          status: 200,
        }),
      ),
    musicfetchToken: "server-only-token",
    maxJobs: 1,
    targetSongID: testJob().song_id,
    randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert(summary.completed === 1, "le morceau doit être finalisé");
  assert(summary.audio_metrics_enriched === 1, "audioMetrics doit être compté");
  const payload = completedPayload as Record<string, unknown> | undefined;
  assert(payload?.tempo_bpm === 100, "le tempo doit être arrondi");
  assert(
    payload?.musical_key === "Am",
    "la tonalité doit être mappée",
  );
  const claim = client.calls.find((call) =>
    call.name === "claim_song_enrichment_jobs"
  );
  assert(claim?.parameters?.p_limit === 1, "l'enqueue user reste ciblé à 1");
  assert(
    claim?.parameters?.p_song_id === testJob().song_id,
    "le worker ne doit pas traiter un autre morceau",
  );
});

Deno.test("sans token, l'absence de source exacte devient un cache négatif clair", async () => {
  let finishedOutcome = "";
  const client = new MockRPC((name, parameters) => {
    if (name === "claim_song_enrichment_jobs") {
      return { data: [testJob()], error: null };
    }
    if (name === "finish_song_enrichment_job") {
      finishedOutcome = String(parameters?.p_outcome);
      return { data: true, error: null };
    }
    if (name === "release_song_enrichment_claim") {
      return { data: 0, error: null };
    }
    return { data: null, error: { message: "unexpected" } };
  });
  const summary = await runEnrichmentWorker(client, {
    fetcher: () => {
      throw new Error("aucun HTTP attendu");
    },
    musicfetchToken: null,
  });
  assert(summary.negative === 1, "le résultat doit être négatif et cacheable");
  assert(finishedOutcome === "negative", "la file doit passer en negative");
  assert(
    summary.audio_metrics === "client_fallback",
    "le client doit savoir que l'analyse locale reste nécessaire",
  );
});

Deno.test("le quota SQL diffère et libère les claims non traités", async () => {
  const client = new MockRPC((name) => {
    if (name === "claim_song_enrichment_jobs") {
      return { data: [testJob()], error: null };
    }
    if (name === "reserve_song_enrichment_provider_call") {
      return { data: false, error: null };
    }
    if (name === "release_song_enrichment_claim") {
      return { data: 1, error: null };
    }
    return { data: null, error: { message: "unexpected" } };
  });
  const summary = await runEnrichmentWorker(client, {
    fetcher: () => {
      throw new Error("le réseau ne doit pas être appelé");
    },
    musicfetchToken: "server-only-token",
  });
  assert(summary.deferred === 1, "le morceau doit rester différé");
  assert(summary.released === 1, "le lease doit être libéré immédiatement");
  assert(
    !client.calls.some((call) => call.name === "finish_song_enrichment_job"),
    "un appel non tenté ne doit pas consommer une tentative métier",
  );
});

Deno.test("un 5xx est replanifié avec backoff", async () => {
  let retryDelay: unknown;
  const client = new MockRPC((name, parameters) => {
    if (name === "claim_song_enrichment_jobs") {
      return { data: [testJob({ attempt_number: 3 })], error: null };
    }
    if (name === "reserve_song_enrichment_provider_call") {
      return { data: true, error: null };
    }
    if (name === "finish_song_enrichment_job") {
      retryDelay = parameters?.p_retry_after_seconds;
      return { data: true, error: null };
    }
    if (name === "release_song_enrichment_claim") {
      return { data: 0, error: null };
    }
    return { data: null, error: { message: "unexpected" } };
  });
  const summary = await runEnrichmentWorker(client, {
    fetcher: () => Promise.resolve(new Response("down", { status: 503 })),
    musicfetchToken: "server-only-token",
  });
  assert(summary.retried === 1, "le 5xx doit être replanifié");
  assert(retryDelay === 120, "la troisième tentative doit attendre 120 s");
});
