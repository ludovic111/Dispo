import {
  audioMetricsMetadata,
  EnrichmentJob,
  enrichSong,
  extractAppleTrackID,
  normalizeIsrc,
  officialPlatformURL,
  parseMusicfetchResponse,
  parseOdesliSmartPage,
} from "./providers.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const equal = (actual: unknown, expected: unknown, message: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
  }
};

const job = (overrides: Partial<EnrichmentJob> = {}): EnrichmentJob => ({
  song_id: "11111111-1111-4111-8111-111111111111",
  title: "Caravan",
  artist: "John Wasson",
  isrc: "USRC17607839",
  apple_id: "1572919354",
  apple_url: "https://music.apple.com/fi/album/caravan/1572919347?i=1572919354",
  attempt_number: 1,
  ...overrides,
});

const odesliHTML = (
  expectedID = "1572919354",
  extraLinks: Record<string, unknown>[] = [],
  appleLinkID = expectedID,
) => {
  const pageData = {
    entityData: {
      provider: "itunes",
      type: "song",
      id: expectedID,
      title: "Caravan",
      artistName: "John Wasson",
      thumbnailUrl:
        "https://is1-ssl.mzstatic.com/image/thumb/Music/test/512x512bb.jpg",
      duration: 177_000,
      genre: "Jazz",
      releaseDate: { year: 2000 },
    },
    sections: [{
      links: [
        {
          platform: "appleMusic",
          uniqueId: `itunes|song|${appleLinkID}`,
          url:
            `https://geo.music.apple.com/ch/album/_/1572919347?i=${appleLinkID}&mt=1`,
        },
        {
          platform: "spotify",
          uniqueId: "spotify|song|3n3Ppam7vgaVa1iaRUc9Lp",
          url: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
        },
        {
          platform: "youtubeMusic",
          uniqueId: "youtubeMusic|song|LXkpWY5Y02Q",
          url: "https://music.youtube.com/watch?v=LXkpWY5Y02Q",
        },
        {
          platform: "deezer",
          uniqueId: "deezer|song|1398706592",
          url: "https://www.deezer.com/track/1398706592",
        },
        {
          platform: "tidal",
          uniqueId: "tidal|song|186994102",
          url: "https://listen.tidal.com/track/186994102",
        },
        {
          platform: "amazonMusic",
          uniqueId: "amazon|song|B096WQDK25",
          url:
            "https://music.amazon.com/albums/B096WRT98Y?trackAsin=B096WQDK25",
        },
        ...extraLinks,
      ],
    }],
  };
  return `<html><script id="__NEXT_DATA__" type="application/json">${
    JSON.stringify({ props: { pageProps: { pageData } } })
  }</script></html>`;
};

const musicfetchBody = (overrides: Record<string, unknown> = {}) => ({
  result: {
    type: "track",
    isrc: "USRC17607839",
    title: "Caravan",
    artistName: "John Wasson",
    artworkUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music/test/512x512bb.jpg",
    durationMs: 177_000,
    genres: ["Jazz"],
    releaseYear: 2000,
    audioMetrics: { tempo: 126.6, key: 6, mode: 0 },
    services: {
      appleMusic: {
        id: "1572919354",
        link:
          "https://music.apple.com/fi/album/caravan/1572919347?i=1572919354",
      },
      spotify: {
        id: "3n3Ppam7vgaVa1iaRUc9Lp",
        link: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
      },
      youtubeMusic: {
        id: "LXkpWY5Y02Q",
        link: "https://music.youtube.com/watch?v=LXkpWY5Y02Q",
      },
      deezer: {
        id: "1398706592",
        link: "https://www.deezer.com/track/1398706592",
      },
      tidal: {
        id: "186994102",
        link: "https://listen.tidal.com/track/186994102",
      },
      amazonMusic: {
        id: "B096WQDK25",
        link: "https://music.amazon.com/albums/B096WRT98Y?trackAsin=B096WQDK25",
      },
    },
    ...overrides,
  },
});

Deno.test("normalise un ISRC et rejette les identifiants ambigus", () => {
  equal(normalizeIsrc("us-rc1-76-07839"), "USRC17607839", "ISRC normalisé");
  assert(normalizeIsrc("USRC176") === null, "un ISRC court doit être rejeté");
  assert(normalizeIsrc("javascript:alert(1)") === null, "entrée non ISRC");
});

Deno.test("valide strictement les URL Apple et les six hôtes officiels", () => {
  equal(
    extractAppleTrackID(
      "https://music.apple.com/ch/album/x/123?i=456",
    ),
    "456",
    "l'identifiant de piste vient du paramètre i",
  );
  equal(
    extractAppleTrackID("https://music.apple.com/ch/song/x/456"),
    "456",
    "une URL /song est acceptée",
  );
  assert(
    extractAppleTrackID("https://music.apple.com/ch/album/x/456") === null,
    "un identifiant d'album ne doit pas devenir une piste",
  );
  assert(
    officialPlatformURL(
      "spotify",
      "https://open.spotify.com.evil.example/track/3n3Ppam7vgaVa1iaRUc9Lp",
    ) === null,
    "un sous-domaine trompeur doit être rejeté",
  );
  assert(
    officialPlatformURL(
      "tidal",
      "https://user@listen.tidal.com/track/186994102",
    ) === null,
    "les credentials URL doivent être rejetés",
  );
  assert(
    officialPlatformURL(
      "youtubeMusic",
      "https://music.youtube.com/search?q=Caravan",
    ) === null,
    "une recherche n'est pas un lien direct",
  );
});

Deno.test("mappe audioMetrics vers tempo arrondi et tonalité majeure/mineure", () => {
  equal(
    audioMetricsMetadata({ tempo: 126.6, key: 10, mode: 0 }),
    { tempo_bpm: 127, musical_key: "Bbm" },
    "tempo et tonalité mineure",
  );
  equal(
    audioMetricsMetadata({ tempo: 80.2, key: 3, mode: 1 }),
    { tempo_bpm: 80, musical_key: "Eb" },
    "tonalité majeure",
  );
  equal(
    audioMetricsMetadata({ tempo: 900, key: 12, mode: 4 }),
    {},
    "les valeurs hors bornes sont omises",
  );
  equal(
    audioMetricsMetadata({ tempo: Number.NaN, key: 1.5, mode: 0 }),
    {},
    "les nombres non finis ou non entiers sont omis",
  );
});

Deno.test("parse la page publique Odesli et garde uniquement six liens directs", () => {
  const payload = parseOdesliSmartPage(odesliHTML(), "1572919354");
  assert(payload?.source === "odesli", "la source doit être Odesli");
  assert(payload?.title === "Caravan", "les métadonnées Odesli sont vérifiées");
  assert(payload?.links.length === 6, "les six plateformes doivent être lues");
  assert(
    payload?.platform_ids.amazonMusic === "B096WQDK25",
    "l'ASIN piste doit être conservé",
  );
  const regionalAlias = parseOdesliSmartPage(
    odesliHTML("724502206", [], "738336150"),
    "724502206",
  );
  assert(
    regionalAlias?.platform_ids.appleMusic === "738336150" &&
      regionalAlias.links.some((link) =>
        link.platform === "appleMusic" && link.external_id === "738336150"
      ),
    "une page Odesli vérifiée peut exposer un ID Apple CH distinct du canonique",
  );
  assert(
    parseOdesliSmartPage(odesliHTML("999"), "1572919354") === null,
    "une page correspondant à une autre piste doit être rejetée",
  );
  const poisoned = parseOdesliSmartPage(
    odesliHTML("1572919354", [{
      platform: "spotify",
      url: "https://evil.example/track/3n3Ppam7vgaVa1iaRUc9Lp",
    }]),
    "1572919354",
  );
  assert(poisoned?.links.length === 6, "le doublon empoisonné reste ignoré");
  const mismatchedID = parseOdesliSmartPage(
    odesliHTML().replace(
      "spotify|song|3n3Ppam7vgaVa1iaRUc9Lp",
      "spotify|song|Different123",
    ),
    "1572919354",
  );
  assert(
    mismatchedID?.links.some((link) => link.platform === "spotify") === false,
    "un uniqueID qui ne correspond pas à l'URL doit être rejeté",
  );
});

Deno.test("parse Musicfetch, vérifie l'ISRC et mappe audioMetrics", () => {
  const payload = parseMusicfetchResponse(musicfetchBody(), job());
  assert(payload?.source === "musicfetch", "la source Musicfetch est attendue");
  assert(payload?.tempo_bpm === 127, "le tempo doit être arrondi");
  assert(payload?.musical_key === "F#m", "la tonalité doit être dérivée");
  assert(payload?.artwork_url?.includes("mzstatic.com"), "artwork officiel");
  assert(payload?.links.length === 6, "les six services doivent être mappés");
  assert(
    parseMusicfetchResponse(
      musicfetchBody({ isrc: "GBAYE6800011" }),
      job(),
    ) === null,
    "un ISRC de réponse différent doit être rejeté",
  );
});

Deno.test("Musicfetch ne transforme pas un lien d'un autre marché en CH", () => {
  const services = {
    ...(musicfetchBody().result.services as Record<string, unknown>),
    spotify: {
      id: "3n3Ppam7vgaVa1iaRUc9Lp",
      links: {
        US: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
      },
    },
  };
  const payload = parseMusicfetchResponse(musicfetchBody({ services }), job());
  assert(
    payload?.links.some((link) => link.platform === "spotify") === false,
    "un lien US ne doit pas être persisté comme CH",
  );
});

Deno.test("Musicfetch vérifie l'identité Apple lorsque l'ISRC manque", () => {
  const noIsrcJob = job({ isrc: null });
  const wrongApple = musicfetchBody({
    isrc: null,
    services: {
      ...(musicfetchBody().result.services as Record<string, unknown>),
      appleMusic: {
        id: "999",
        link: "https://music.apple.com/ch/song/wrong/999",
      },
    },
  });
  assert(
    parseMusicfetchResponse(wrongApple, noIsrcJob) === null,
    "une piste Apple différente doit être rejetée",
  );
});

Deno.test("sans token Musicfetch, Odesli résout les liens et le worker reste utile", async () => {
  let reservations = 0;
  let calls = 0;
  const outcome = await enrichSong(job(), {
    fetcher: () => {
      calls += 1;
      return Promise.resolve(new Response(odesliHTML(), { status: 200 }));
    },
    reserveProviderCall: () => {
      reservations += 1;
      return Promise.resolve(true);
    },
    musicfetchToken: null,
  });
  assert(outcome.kind === "success", "Odesli doit suffire sans token");
  assert(
    outcome.kind === "success" && outcome.payload.source === "odesli",
    "la source ne doit pas prétendre utiliser Musicfetch",
  );
  equal({ calls, reservations }, { calls: 1, reservations: 1 }, "un seul HTTP");
});

Deno.test("avec token, Musicfetch complète Odesli sans remplacer ses liens", async () => {
  let reservations = 0;
  const outcome = await enrichSong(job(), {
    fetcher: (input, init) => {
      const url = String(input);
      assert(
        init?.redirect === "error",
        "les redirects ne doivent pas recevoir le token",
      );
      return Promise.resolve(
        url.includes("musicfetch")
          ? new Response(JSON.stringify(musicfetchBody()), { status: 200 })
          : new Response(odesliHTML(), { status: 200 }),
      );
    },
    reserveProviderCall: () => {
      reservations += 1;
      return Promise.resolve(true);
    },
    musicfetchToken: "server-only-token",
  });
  assert(outcome.kind === "success", "les fournisseurs doivent être fusionnés");
  assert(
    outcome.kind === "success" &&
      outcome.payload.source === "odesli+musicfetch" &&
      outcome.payload.musical_key === "F#m",
    "Musicfetch doit seulement enrichir le résultat primaire",
  );
  assert(reservations === 2, "chaque HTTP doit réserver son propre quota");
});

Deno.test("le quota global diffère l'appel avant tout accès réseau", async () => {
  let calls = 0;
  const outcome = await enrichSong(job(), {
    fetcher: () => {
      calls += 1;
      return Promise.resolve(new Response());
    },
    reserveProviderCall: () => Promise.resolve(false),
    musicfetchToken: null,
  });
  assert(outcome.kind === "deferred", "le travail doit rester en file");
  assert(calls === 0, "aucun HTTP ne doit contourner la réservation SQL");
});

Deno.test("un 429 respecte Retry-After et déclenche le backoff durable", async () => {
  const outcome = await enrichSong(job(), {
    fetcher: () =>
      Promise.resolve(
        new Response("quota", {
          status: 429,
          headers: { "retry-after": "120" },
        }),
      ),
    reserveProviderCall: () => Promise.resolve(true),
    musicfetchToken: null,
  });
  assert(
    outcome.kind === "retry" && outcome.retryAfterSeconds === 120,
    "Retry-After doit piloter la prochaine tentative",
  );
});

Deno.test("une réponse fournisseur sans Content-Length reste bornée", async () => {
  const outcome = await enrichSong(job(), {
    fetcher: () =>
      Promise.resolve(
        new Response(new Uint8Array(1_000_001), { status: 200 }),
      ),
    reserveProviderCall: () => Promise.resolve(true),
    musicfetchToken: null,
  });
  assert(
    outcome.kind === "negative" &&
      outcome.reason.includes("odesli_invalid_body"),
    "un body fournisseur trop gros doit être arrêté et rejeté",
  );
});
