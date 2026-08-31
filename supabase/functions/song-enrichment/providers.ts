export const SONG_PLATFORMS = [
  "appleMusic",
  "spotify",
  "youtubeMusic",
  "deezer",
  "tidal",
  "amazonMusic",
] as const;

export type SongPlatform = typeof SONG_PLATFORMS[number];

export type EnrichmentJob = {
  song_id: string;
  title: string;
  artist: string;
  isrc: string | null;
  apple_id: string | null;
  apple_url: string | null;
  attempt_number: number;
};

export type ExactPlatformLink = {
  platform: SongPlatform;
  market: "CH";
  url: string;
  external_id: string | null;
};

export type EnrichmentPayload = {
  source: "odesli" | "musicfetch" | "odesli+musicfetch";
  isrc?: string;
  title?: string;
  artist?: string;
  album_title?: string;
  artwork_url?: string;
  duration_ms?: number;
  genres?: string[];
  release_year?: number;
  tempo_bpm?: number;
  musical_key?: string;
  platform_ids: Partial<Record<SongPlatform, string>>;
  links: ExactPlatformLink[];
};

export type ProviderOutcome =
  | { kind: "success"; payload: EnrichmentPayload }
  | { kind: "negative"; reason: string }
  | { kind: "retry"; reason: string; retryAfterSeconds: number }
  | { kind: "deferred"; reason: "provider_rate_limited" };

export type ProviderDependencies = {
  fetcher: typeof fetch;
  reserveProviderCall: () => Promise<boolean>;
  musicfetchToken?: string | null;
  timeoutMilliseconds?: number;
};

type ProviderResponse =
  | { kind: "response"; response: Response }
  | Exclude<ProviderOutcome, { kind: "success" }>;

const MAX_PROVIDER_BODY_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNonEmptyString = (value: unknown, maximum = 2_048) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
};

const boundedInteger = (value: unknown, minimum: number, maximum: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= minimum &&
    value <= maximum
    ? value
    : null;

const officialArtworkURL = (value: unknown) => {
  const url = cleanURL(value);
  if (!url || !/^[a-z0-9-]+[.]mzstatic[.]com$/i.test(url.hostname)) {
    return null;
  }
  return url.toString();
};

export const normalizeIsrc = (value: unknown) => {
  const raw = asNonEmptyString(value, 64);
  if (!raw) return null;
  const normalized = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(normalized) ? normalized : null;
};

const cleanURL = (value: unknown) => {
  const raw = asNonEmptyString(value);
  if (!raw || /\s/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443")
    ) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
};

const pathSegments = (url: URL) =>
  url.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

export const extractAppleTrackID = (value: unknown) => {
  const url = cleanURL(value);
  if (
    !url || ![
      "music.apple.com",
      "itunes.apple.com",
      "geo.music.apple.com",
    ].includes(url.hostname.toLowerCase())
  ) return null;
  const queryID = url.searchParams.get("i");
  if (queryID && /^[0-9]{1,20}$/.test(queryID)) return queryID;
  const segments = pathSegments(url);
  const songIndex = segments.findIndex((segment) => segment === "song");
  const finalSegment = segments.at(-1) ?? "";
  const pathID = /^id?([0-9]{1,20})$/i.exec(finalSegment)?.[1] ??
    (/^[0-9]{1,20}$/.test(finalSegment) ? finalSegment : null);
  return songIndex >= 0 ? pathID : null;
};

const spotifyID = (url: URL) => {
  const segments = pathSegments(url);
  const index = segments.indexOf("track");
  const value = index >= 0 ? segments[index + 1] : null;
  return value && /^[A-Za-z0-9]{10,64}$/.test(value) ? value : null;
};

const deezerID = (url: URL) => {
  const segments = pathSegments(url);
  const index = segments.indexOf("track");
  const value = index >= 0 ? segments[index + 1] : null;
  return value && /^[0-9]{1,24}$/.test(value) ? value : null;
};

const tidalID = (url: URL) => {
  const segments = pathSegments(url);
  const index = segments.indexOf("track");
  const value = index >= 0 ? segments[index + 1] : null;
  return value && /^[0-9]{1,24}$/.test(value) ? value : null;
};

const amazonID = (url: URL) => {
  const queryID = url.searchParams.get("trackAsin");
  if (queryID && /^[A-Z0-9]{8,20}$/i.test(queryID)) return queryID;
  const segments = pathSegments(url);
  const index = segments.indexOf("tracks");
  const value = index >= 0 ? segments[index + 1] : null;
  return value && /^[A-Z0-9]{8,20}$/i.test(value) ? value : null;
};

const externalIDFromURL = (platform: SongPlatform, url: URL) => {
  switch (platform) {
    case "appleMusic":
      return extractAppleTrackID(url.toString());
    case "spotify":
      return spotifyID(url);
    case "youtubeMusic": {
      const value = url.searchParams.get("v");
      return value && /^[A-Za-z0-9_-]{6,32}$/.test(value) ? value : null;
    }
    case "deezer":
      return deezerID(url);
    case "tidal":
      return tidalID(url);
    case "amazonMusic":
      return amazonID(url);
  }
};

export const officialPlatformURL = (
  platform: SongPlatform,
  value: unknown,
) => {
  const url = cleanURL(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  let externalID: string | null = null;
  switch (platform) {
    case "appleMusic":
      if (
        ![
          "music.apple.com",
          "itunes.apple.com",
          "geo.music.apple.com",
        ].includes(host)
      ) return null;
      externalID = extractAppleTrackID(url.toString());
      break;
    case "spotify":
      if (host !== "open.spotify.com") return null;
      externalID = spotifyID(url);
      break;
    case "youtubeMusic":
      if (host !== "music.youtube.com" || url.pathname !== "/watch") {
        return null;
      }
      externalID = externalIDFromURL(platform, url);
      break;
    case "deezer":
      if (host !== "deezer.com" && host !== "www.deezer.com") return null;
      externalID = deezerID(url);
      break;
    case "tidal":
      if (host !== "tidal.com" && host !== "listen.tidal.com") return null;
      externalID = tidalID(url);
      break;
    case "amazonMusic":
      if (host !== "music.amazon.com") return null;
      externalID = amazonID(url);
      break;
  }
  if (!externalID) return null;
  return { url: url.toString(), externalID };
};

const retryAfterSeconds = (response: Response, attemptNumber: number) => {
  const header = response.headers.get("retry-after")?.trim();
  if (header && /^[0-9]{1,6}$/.test(header)) {
    return Math.min(Math.max(Number(header), 10), 86_400);
  }
  if (header) {
    const at = Date.parse(header);
    if (Number.isFinite(at)) {
      return Math.min(
        Math.max(Math.ceil((at - Date.now()) / 1_000), 10),
        86_400,
      );
    }
  }
  return Math.min(30 * (2 ** Math.max(attemptNumber - 1, 0)), 3_600);
};

const providerRequest = async (
  url: URL,
  init: RequestInit,
  job: EnrichmentJob,
  dependencies: ProviderDependencies,
): Promise<ProviderResponse> => {
  if (!await dependencies.reserveProviderCall()) {
    return { kind: "deferred", reason: "provider_rate_limited" };
  }
  try {
    const response = await dependencies.fetcher(url, {
      ...init,
      // Ne jamais transmettre x-token à un hôte de redirection. Les deux
      // endpoints canoniques sont stables et ne nécessitent aucun redirect.
      redirect: "error",
      signal: AbortSignal.timeout(
        dependencies.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MS,
      ),
    });
    if (response.status === 429 || response.status >= 500) {
      return {
        kind: "retry",
        reason: `provider_http_${response.status}`,
        retryAfterSeconds: retryAfterSeconds(response, job.attempt_number),
      };
    }
    return { kind: "response", response };
  } catch {
    return {
      kind: "retry",
      reason: "provider_network_error",
      retryAfterSeconds: Math.min(
        30 * (2 ** Math.max(job.attempt_number - 1, 0)),
        3_600,
      ),
    };
  }
};

const boundedText = async (response: Response) => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_BODY_BYTES) {
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_PROVIDER_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
};

const platformFromUnknown = (value: unknown): SongPlatform | null =>
  typeof value === "string" &&
    (SONG_PLATFORMS as readonly string[]).includes(value)
    ? value as SongPlatform
    : null;

const finalUniqueIDPart = (value: unknown) => {
  const raw = asNonEmptyString(value, 256);
  if (!raw) return null;
  const candidate = raw.split(/::|\|/).at(-1)?.trim();
  return candidate && candidate.length <= 256 ? candidate : null;
};

const linksPayload = (
  entries: Array<{ platform: unknown; url: unknown; uniqueID?: unknown }>,
) => {
  const links = new Map<SongPlatform, ExactPlatformLink>();
  const platformIDs: Partial<Record<SongPlatform, string>> = {};
  for (const entry of entries) {
    const platform = platformFromUnknown(entry.platform);
    if (!platform || links.has(platform)) continue;
    const official = officialPlatformURL(platform, entry.url);
    if (!official) continue;
    const suppliedID = finalUniqueIDPart(entry.uniqueID);
    const idsMatch = platform === "amazonMusic"
      ? suppliedID?.toLowerCase() === official.externalID.toLowerCase()
      : suppliedID === official.externalID;
    if (suppliedID && !idsMatch) continue;
    const uniqueID = official.externalID;
    links.set(platform, {
      platform,
      market: "CH",
      url: official.url,
      external_id: uniqueID,
    });
    platformIDs[platform] = uniqueID;
  }
  return { links: [...links.values()], platformIDs };
};

const odesliPageData = (html: string) => {
  const match =
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
      .exec(html);
  if (!match) return null;
  try {
    const root: unknown = JSON.parse(match[1]);
    if (
      !isRecord(root) || !isRecord(root.props) ||
      !isRecord(root.props.pageProps) ||
      !isRecord(root.props.pageProps.pageData)
    ) {
      return null;
    }
    return root.props.pageProps.pageData;
  } catch {
    return null;
  }
};

export const parseOdesliSmartPage = (
  html: string,
  expectedAppleTrackID: string,
): EnrichmentPayload | null => {
  const pageData = odesliPageData(html);
  if (!pageData || !isRecord(pageData.entityData)) return null;
  const entity = pageData.entityData;
  const provider = asNonEmptyString(entity.provider, 32)?.toLowerCase();
  const type = asNonEmptyString(entity.type, 32)?.toLowerCase();
  const entityID = asNonEmptyString(entity.id, 64);
  if (
    provider !== "itunes" || (type !== "song" && type !== "track") ||
    entityID !== expectedAppleTrackID
  ) return null;

  const entries: Array<{
    platform: unknown;
    url: unknown;
    uniqueID?: unknown;
  }> = [];
  if (Array.isArray(pageData.sections)) {
    for (const section of pageData.sections) {
      if (!isRecord(section) || !Array.isArray(section.links)) continue;
      for (const link of section.links) {
        if (!isRecord(link) || link.show === false) continue;
        entries.push({
          platform: link.platform,
          url: link.url,
          uniqueID: link.uniqueId,
        });
      }
    }
  }
  const parsed = linksPayload(entries);
  if (!parsed.links.length) return null;
  const title = asNonEmptyString(entity.title, 300);
  const artist = asNonEmptyString(entity.artistName, 300);
  const albumTitle = asNonEmptyString(entity.albumName, 300);
  const artworkURL = officialArtworkURL(entity.thumbnailUrl);
  const duration = boundedInteger(entity.duration, 1, 2_147_483_647);
  const genre = asNonEmptyString(entity.genre, 100);
  const releaseYear = isRecord(entity.releaseDate)
    ? boundedInteger(entity.releaseDate.year, 1800, 2200)
    : null;
  return {
    source: "odesli",
    ...(title ? { title } : {}),
    ...(artist ? { artist } : {}),
    ...(albumTitle ? { album_title: albumTitle } : {}),
    ...(artworkURL ? { artwork_url: artworkURL } : {}),
    ...(duration ? { duration_ms: duration } : {}),
    ...(genre ? { genres: [genre] } : {}),
    ...(releaseYear ? { release_year: releaseYear } : {}),
    platform_ids: parsed.platformIDs,
    links: parsed.links,
  };
};

export const resolveOdesli = async (
  job: EnrichmentJob,
  dependencies: ProviderDependencies,
): Promise<ProviderOutcome> => {
  const trackID = extractAppleTrackID(job.apple_url);
  if (!trackID) return { kind: "negative", reason: "apple_track_url_missing" };
  if (job.apple_id && job.apple_id !== trackID) {
    return { kind: "negative", reason: "apple_track_identity_mismatch" };
  }
  // L'ancien endpoint API sans clé renvoie désormais
  // PUBLIC_API_ACCESS_DEPRECATED. La page publique SSR reste le chemin Odesli
  // immédiatement utilisable sans abonnement et expose les mêmes liens exacts.
  const url = new URL(`https://song.link/ch/i/${trackID}`);
  const requested = await providerRequest(
    url,
    {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Dispo-Song-Enrichment/1.0",
      },
    },
    job,
    dependencies,
  );
  if (requested.kind !== "response") return requested;
  const response = requested.response;
  if (response.status === 404 || response.status === 400) {
    return { kind: "negative", reason: `odesli_http_${response.status}` };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      kind: "retry",
      reason: `odesli_http_${response.status}`,
      retryAfterSeconds: 3_600,
    };
  }
  if (!response.ok) {
    return { kind: "negative", reason: `odesli_http_${response.status}` };
  }
  const html = await boundedText(response);
  if (!html) return { kind: "negative", reason: "odesli_invalid_body" };
  const payload = parseOdesliSmartPage(html, trackID);
  return payload
    ? { kind: "success", payload }
    : { kind: "negative", reason: "odesli_track_not_resolved" };
};

const musicfetchServiceLink = (service: Record<string, unknown>) => {
  const direct = asNonEmptyString(service.link) ??
    asNonEmptyString(service.url);
  if (direct) return direct;
  if (!isRecord(service.links)) return null;
  return asNonEmptyString(service.links.CH) ??
    asNonEmptyString(service.links.ch) ?? null;
};

const PITCH_CLASS_LABELS = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export const audioMetricsMetadata = (value: unknown) => {
  if (!isRecord(value)) return {};
  const output: { tempo_bpm?: number; musical_key?: string } = {};
  if (typeof value.tempo === "number" && Number.isFinite(value.tempo)) {
    const rounded = Math.round(value.tempo);
    if (rounded >= 20 && rounded <= 400) output.tempo_bpm = rounded;
  }
  if (
    typeof value.key === "number" && Number.isInteger(value.key) &&
    value.key >= 0 && value.key <= 11 &&
    typeof value.mode === "number" && Number.isInteger(value.mode) &&
    (value.mode === 0 || value.mode === 1)
  ) {
    const label = PITCH_CLASS_LABELS[value.key];
    output.musical_key = value.mode === 0 ? `${label}m` : label;
  }
  return output;
};

export const parseMusicfetchResponse = (
  body: unknown,
  job: EnrichmentJob,
): EnrichmentPayload | null => {
  if (!isRecord(body) || !isRecord(body.result)) return null;
  const result = body.result;
  if (result.type !== "track" || !isRecord(result.services)) return null;
  const expectedIsrc = normalizeIsrc(job.isrc);
  const resultIsrc = normalizeIsrc(result.isrc);
  if (expectedIsrc && resultIsrc !== expectedIsrc) return null;
  const expectedAppleID = extractAppleTrackID(job.apple_url) ?? job.apple_id;
  if (
    job.apple_id && extractAppleTrackID(job.apple_url) &&
    job.apple_id !== extractAppleTrackID(job.apple_url)
  ) return null;

  const entries: Array<{
    platform: unknown;
    url: unknown;
    uniqueID?: unknown;
  }> = [];
  for (const platform of SONG_PLATFORMS) {
    const service = result.services[platform];
    if (!isRecord(service)) continue;
    entries.push({
      platform,
      url: musicfetchServiceLink(service),
      uniqueID: service.id,
    });
  }
  const parsed = linksPayload(entries);
  if (!parsed.links.length) return null;
  if (!expectedIsrc && expectedAppleID) {
    const returnedAppleID = parsed.platformIDs.appleMusic;
    if (returnedAppleID !== expectedAppleID) return null;
  }
  const metrics = audioMetricsMetadata(result.audioMetrics);
  const title = asNonEmptyString(result.title, 300) ??
    asNonEmptyString(result.trackName, 300);
  const artist = asNonEmptyString(result.artistName, 300) ??
    asNonEmptyString(result.artist, 300);
  const albumTitle = asNonEmptyString(result.albumName, 300) ??
    asNonEmptyString(result.album, 300);
  const artworkURL = officialArtworkURL(result.artworkUrl) ??
    officialArtworkURL(result.thumbnailUrl);
  const duration = boundedInteger(
    result.durationMs ?? result.duration,
    1,
    2_147_483_647,
  );
  const releaseYear = boundedInteger(result.releaseYear, 1800, 2200);
  const genres = Array.isArray(result.genres)
    ? result.genres.flatMap((value) => {
      const genre = asNonEmptyString(value, 100);
      return genre ? [genre] : [];
    }).slice(0, 12)
    : [];
  return {
    source: "musicfetch",
    ...(resultIsrc ? { isrc: resultIsrc } : {}),
    ...(title ? { title } : {}),
    ...(artist ? { artist } : {}),
    ...(albumTitle ? { album_title: albumTitle } : {}),
    ...(artworkURL ? { artwork_url: artworkURL } : {}),
    ...(duration ? { duration_ms: duration } : {}),
    ...(genres.length ? { genres } : {}),
    ...(releaseYear ? { release_year: releaseYear } : {}),
    ...metrics,
    platform_ids: parsed.platformIDs,
    links: parsed.links,
  };
};

export const resolveMusicfetch = async (
  job: EnrichmentJob,
  dependencies: ProviderDependencies,
): Promise<ProviderOutcome> => {
  const token = asNonEmptyString(dependencies.musicfetchToken, 4_096);
  if (!token) return { kind: "negative", reason: "musicfetch_not_configured" };
  const normalizedIsrc = normalizeIsrc(job.isrc);
  const appleURL = officialPlatformURL("appleMusic", job.apple_url)?.url;
  if (!normalizedIsrc && !appleURL) {
    return { kind: "negative", reason: "musicfetch_source_missing" };
  }
  const endpoint = normalizedIsrc ? "/isrc" : "/url";
  const url = new URL(endpoint, "https://api.musicfetch.io");
  url.searchParams.set(
    normalizedIsrc ? "isrc" : "url",
    normalizedIsrc ?? appleURL!,
  );
  url.searchParams.set("services", SONG_PLATFORMS.join(","));
  url.searchParams.set("country", "CH");
  const requested = await providerRequest(
    url,
    {
      headers: { accept: "application/json", "x-token": token },
    },
    job,
    dependencies,
  );
  if (requested.kind !== "response") return requested;
  const response = requested.response;
  if (response.status === 404 || response.status === 400) {
    return { kind: "negative", reason: `musicfetch_http_${response.status}` };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      kind: "retry",
      reason: `musicfetch_http_${response.status}`,
      retryAfterSeconds: 3_600,
    };
  }
  if (!response.ok) {
    return { kind: "negative", reason: `musicfetch_http_${response.status}` };
  }
  const text = await boundedText(response);
  if (!text) return { kind: "negative", reason: "musicfetch_invalid_body" };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: "negative", reason: "musicfetch_invalid_json" };
  }
  const payload = parseMusicfetchResponse(body, job);
  return payload
    ? { kind: "success", payload }
    : { kind: "negative", reason: "musicfetch_identity_or_links_invalid" };
};

export const mergeEnrichmentPayloads = (
  odesli: EnrichmentPayload | null,
  musicfetch: EnrichmentPayload | null,
): EnrichmentPayload | null => {
  if (!odesli && !musicfetch) return null;
  const links = new Map<SongPlatform, ExactPlatformLink>();
  for (const link of musicfetch?.links ?? []) links.set(link.platform, link);
  // Odesli reste le résolveur primaire : ses liens exacts l'emportent, tandis
  // que Musicfetch complète les services absents et apporte audioMetrics.
  for (const link of odesli?.links ?? []) links.set(link.platform, link);
  const source = odesli && musicfetch
    ? "odesli+musicfetch"
    : odesli
    ? "odesli"
    : "musicfetch";
  return {
    source,
    ...(musicfetch?.isrc ? { isrc: musicfetch.isrc } : {}),
    ...(odesli?.title ?? musicfetch?.title
      ? { title: odesli?.title ?? musicfetch?.title }
      : {}),
    ...(odesli?.artist ?? musicfetch?.artist
      ? { artist: odesli?.artist ?? musicfetch?.artist }
      : {}),
    ...(odesli?.album_title ?? musicfetch?.album_title
      ? { album_title: odesli?.album_title ?? musicfetch?.album_title }
      : {}),
    ...(odesli?.artwork_url ?? musicfetch?.artwork_url
      ? { artwork_url: odesli?.artwork_url ?? musicfetch?.artwork_url }
      : {}),
    ...(odesli?.duration_ms ?? musicfetch?.duration_ms
      ? { duration_ms: odesli?.duration_ms ?? musicfetch?.duration_ms }
      : {}),
    ...((odesli?.genres?.length ?? 0) > 0 ||
        (musicfetch?.genres?.length ?? 0) > 0
      ? { genres: odesli?.genres?.length ? odesli.genres : musicfetch?.genres }
      : {}),
    ...(odesli?.release_year ?? musicfetch?.release_year
      ? { release_year: odesli?.release_year ?? musicfetch?.release_year }
      : {}),
    ...(musicfetch?.tempo_bpm ? { tempo_bpm: musicfetch.tempo_bpm } : {}),
    ...(musicfetch?.musical_key ? { musical_key: musicfetch.musical_key } : {}),
    platform_ids: {
      ...(musicfetch?.platform_ids ?? {}),
      ...(odesli?.platform_ids ?? {}),
    },
    links: [...links.values()],
  };
};

export const enrichSong = async (
  job: EnrichmentJob,
  dependencies: ProviderDependencies,
): Promise<ProviderOutcome> => {
  const odesli = job.apple_url
    ? await resolveOdesli(job, dependencies)
    : { kind: "negative", reason: "apple_track_url_missing" } as const;
  const musicfetch = dependencies.musicfetchToken
    ? await resolveMusicfetch(job, dependencies)
    : { kind: "negative", reason: "musicfetch_not_configured" } as const;
  const payload = mergeEnrichmentPayloads(
    odesli.kind === "success" ? odesli.payload : null,
    musicfetch.kind === "success" ? musicfetch.payload : null,
  );
  if (payload?.links.length) return { kind: "success", payload };
  if (odesli.kind === "deferred" || musicfetch.kind === "deferred") {
    return { kind: "deferred", reason: "provider_rate_limited" };
  }
  const retries = [odesli, musicfetch].filter(
    (outcome): outcome is Extract<ProviderOutcome, { kind: "retry" }> =>
      outcome.kind === "retry",
  );
  if (retries.length) {
    return retries.reduce((latest, item) =>
      item.retryAfterSeconds > latest.retryAfterSeconds ? item : latest
    );
  }
  return {
    kind: "negative",
    reason: [odesli, musicfetch].map((outcome) =>
      outcome.kind === "success" ? "empty_provider_result" : outcome.reason
    ).join("+"),
  };
};
