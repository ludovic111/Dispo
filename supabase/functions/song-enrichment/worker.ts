import {
  EnrichmentJob,
  enrichSong,
  ProviderDependencies,
} from "./providers.ts";

export type RpcError = { message?: string };
export type RpcResult = { data: unknown; error: RpcError | null };
export type RpcClient = {
  rpc: (
    name: string,
    parameters?: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};

export type WorkerDependencies = {
  fetcher: typeof fetch;
  musicfetchToken?: string | null;
  timeoutMilliseconds?: number;
  randomUUID?: () => string;
  maxJobs?: number;
  targetSongID?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNullableString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const claimedJobs = (value: unknown): EnrichmentJob[] | null => {
  if (!Array.isArray(value)) return null;
  const jobs: EnrichmentJob[] = [];
  for (const row of value) {
    if (
      !isRecord(row) || typeof row.song_id !== "string" ||
      typeof row.title !== "string" || typeof row.artist !== "string" ||
      typeof row.attempt_number !== "number" ||
      !Number.isInteger(row.attempt_number)
    ) return null;
    jobs.push({
      song_id: row.song_id,
      title: row.title,
      artist: row.artist,
      isrc: asNullableString(row.isrc),
      apple_id: asNullableString(row.apple_id),
      apple_url: asNullableString(row.apple_url),
      attempt_number: row.attempt_number,
    });
  }
  return jobs;
};

const finish = async (
  client: RpcClient,
  job: EnrichmentJob,
  claimID: string,
  outcome: "retry" | "negative" | "dead",
  error: string,
  retryAfterSeconds?: number,
) => {
  const result = await client.rpc("finish_song_enrichment_job", {
    p_song_id: job.song_id,
    p_claim_id: claimID,
    p_outcome: outcome,
    p_error: error.slice(0, 240),
    p_retry_after_seconds: retryAfterSeconds ?? null,
  });
  return !result.error && result.data === true;
};

export const runEnrichmentWorker = async (
  admin: RpcClient,
  dependencies: WorkerDependencies,
) => {
  const claimID = dependencies.randomUUID
    ? dependencies.randomUUID()
    : crypto.randomUUID();
  const claimed = await admin.rpc("claim_song_enrichment_jobs", {
    p_claim_id: claimID,
    p_limit: Math.min(Math.max(dependencies.maxJobs ?? 5, 1), 5),
    p_song_id: dependencies.targetSongID ?? null,
  });
  if (claimed.error) throw new Error("queue_claim_failed");
  const jobs = claimedJobs(claimed.data);
  if (!jobs) throw new Error("queue_claim_invalid");

  let completed = 0;
  let negative = 0;
  let retried = 0;
  let deferred = 0;
  let failed = 0;
  let audioMetricsEnriched = 0;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const providerDependencies: ProviderDependencies = {
      fetcher: dependencies.fetcher,
      musicfetchToken: dependencies.musicfetchToken,
      timeoutMilliseconds: dependencies.timeoutMilliseconds,
      reserveProviderCall: async () => {
        const reserved = await admin.rpc(
          "reserve_song_enrichment_provider_call",
          { p_song_id: job.song_id },
        );
        if (reserved.error) throw new Error("provider_reservation_failed");
        return reserved.data === true;
      },
    };
    try {
      const outcome = await enrichSong(job, providerDependencies);
      if (outcome.kind === "deferred") {
        deferred = jobs.length - index;
        break;
      }
      if (outcome.kind === "success") {
        const result = await admin.rpc("complete_song_enrichment_job", {
          p_song_id: job.song_id,
          p_claim_id: claimID,
          p_result: outcome.payload,
        });
        if (!result.error && result.data === true) {
          completed += 1;
          if (outcome.payload.tempo_bpm || outcome.payload.musical_key) {
            audioMetricsEnriched += 1;
          }
        } else if (
          await finish(
            admin,
            job,
            claimID,
            "retry",
            "catalog_write_failed",
            300,
          )
        ) {
          retried += 1;
        } else failed += 1;
        continue;
      }
      if (outcome.kind === "retry") {
        if (
          await finish(
            admin,
            job,
            claimID,
            "retry",
            outcome.reason,
            outcome.retryAfterSeconds,
          )
        ) retried += 1;
        else failed += 1;
        continue;
      }
      if (
        await finish(
          admin,
          job,
          claimID,
          "negative",
          outcome.reason,
        )
      ) negative += 1;
      else failed += 1;
    } catch {
      if (
        await finish(
          admin,
          job,
          claimID,
          "retry",
          "worker_job_failed",
          300,
        )
      ) retried += 1;
      else failed += 1;
    }
  }

  // Idempotent : seules les lignes encore en processing avec ce claim sont
  // reprises. Cela libère aussi les éléments non démarrés quand les cinq
  // réservations HTTP de la minute sont épuisées.
  const released = await admin.rpc("release_song_enrichment_claim", {
    p_claim_id: claimID,
  });
  if (released.error) throw new Error("queue_release_failed");

  return {
    claimed: jobs.length,
    completed,
    negative,
    retried,
    deferred,
    failed,
    released: typeof released.data === "number" ? released.data : 0,
    audio_metrics_enriched: audioMetricsEnriched,
    audio_metrics: dependencies.musicfetchToken
      ? "server_optional"
      : "client_fallback",
  };
};
