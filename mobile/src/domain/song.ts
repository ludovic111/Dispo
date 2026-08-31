export interface CanonicalSong {
  artist: string;
  isrc: string | null;
  title: string;
}

export interface MusicLink {
  platform: string;
  url: string;
}

export const STREAMING_PLATFORM_IDS = [
  'appleMusic',
  'spotify',
  'youtubeMusic',
  'deezer',
  'tidal',
  'amazonMusic',
] as const;

export type StreamingPlatformId = (typeof STREAMING_PLATFORM_IDS)[number];

export interface StreamingSong {
  artist: string;
  platformLinks: Record<string, string>;
  title: string;
  trackUrl: string | null;
}

export interface StreamingDestination {
  kind: 'direct' | 'search';
  platform: StreamingPlatformId;
  url: string;
}

export interface IRealSong {
  irealDisabled: boolean;
  irealUrl: string | null;
  title: string;
}

export interface IRealDestination {
  kind: 'direct' | 'search';
  url: string;
}

export interface SongDestination {
  date: string | null;
  groupName: string | null;
  id: string;
  name: string;
  type: string;
}

export function normalizeSongText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function songsMatch(a: CanonicalSong, b: CanonicalSong): boolean {
  const aIsrc = a.isrc?.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const bIsrc = b.isrc?.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (aIsrc && bIsrc) return aIsrc === bIsrc;
  return (
    normalizeSongText(a.artist) === normalizeSongText(b.artist) &&
    normalizeSongText(a.title) === normalizeSongText(b.title)
  );
}

export function functionalMusicLinks(links: MusicLink[]): MusicLink[] {
  return links.filter((link) => isHttpsUrl(link.url));
}

function isHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const authority = value.match(/^https:\/\/([^/?#]*)/i)?.[1] ?? '';
    const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
    return (
      parsed.protocol.toLowerCase() === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !/:\d+$/.test(hostAndPort)
    );
  } catch {
    return false;
  }
}

function normalizedPlatformKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const platformAliases: Record<StreamingPlatformId, readonly string[]> = {
  amazonMusic: ['amazon', 'amazonmusic'],
  appleMusic: ['apple', 'applemusic', 'itunes'],
  deezer: ['deezer'],
  spotify: ['spotify'],
  tidal: ['tidal'],
  youtubeMusic: ['youtube', 'youtubemusic'],
};

const platformHosts: Record<StreamingPlatformId, readonly string[]> = {
  amazonMusic: ['music.amazon.com'],
  appleMusic: ['geo.music.apple.com', 'itunes.apple.com', 'music.apple.com'],
  deezer: ['deezer.com', 'www.deezer.com'],
  spotify: ['open.spotify.com'],
  tidal: ['listen.tidal.com', 'tidal.com'],
  youtubeMusic: ['music.youtube.com'],
};

function isOfficialStreamingUrl(
  platform: StreamingPlatformId,
  value: string | null | undefined,
): value is string {
  if (!isHttpsUrl(value)) return false;
  try {
    return platformHosts[platform].includes(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function directStreamingUrl(platform: StreamingPlatformId, song: StreamingSong): string | null {
  const aliases = platformAliases[platform];
  const direct = Object.entries(song.platformLinks).find(
    ([key, value]) =>
      aliases.includes(normalizedPlatformKey(key)) && isOfficialStreamingUrl(platform, value),
  )?.[1];
  if (direct) return direct;
  return platform === 'appleMusic' && isOfficialStreamingUrl(platform, song.trackUrl)
    ? song.trackUrl
    : null;
}

function streamingSearchUrl(platform: StreamingPlatformId, query: string): string {
  const encoded = encodeURIComponent(query);
  switch (platform) {
    case 'appleMusic':
      return `https://music.apple.com/ch/search?term=${encoded}`;
    case 'spotify':
      return `https://open.spotify.com/search/${encoded}`;
    case 'youtubeMusic':
      return `https://music.youtube.com/search?q=${encoded}`;
    case 'deezer':
      return `https://www.deezer.com/search/${encoded}`;
    case 'tidal':
      return `https://tidal.com/search?q=${encoded}`;
    case 'amazonMusic':
      return `https://music.amazon.com/search/${encoded}`;
  }
}

/**
 * Six destinations stables, dans le même ordre sur iOS et Android.
 * Un lien HTTPS exact gagne toujours ; sinon on fournit une recherche HTTPS
 * fonctionnelle, que le système peut ouvrir dans l'app via Universal/App Links.
 */
export function streamingDestinations(song: StreamingSong): StreamingDestination[] {
  const query = [song.artist.trim(), song.title.trim()].filter(Boolean).join(' ');
  if (!query) return [];
  return STREAMING_PLATFORM_IDS.map((platform) => {
    const direct = directStreamingUrl(platform, song);
    return direct
      ? { kind: 'direct' as const, platform, url: direct }
      : { kind: 'search' as const, platform, url: streamingSearchUrl(platform, query) };
  });
}

const irealSchemes = ['irealb', 'irealbook'] as const;

/** Accepte uniquement les deux schémas documentés par iReal Pro. */
export function irealAppUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (!irealSchemes.some((scheme) => lower.startsWith(`${scheme}://`))) return null;
  const spaceEncoded = value.replace(/ /g, '%20');
  try {
    const parsed = new URL(spaceEncoded);
    return irealSchemes.includes(
      parsed.protocol.slice(0, -1).toLowerCase() as 'irealb' | 'irealbook',
    )
      ? spaceEncoded
      : null;
  } catch {
    return null;
  }
}

/** Recherche locale officielle : `irealb://search?<titre encodé>`. */
export function irealSearchUrl(title: string): string | null {
  const query = title.trim().replace(/\s+/g, ' ');
  if (!query) return null;
  const encoded = encodeURIComponent(query).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `irealb://search?${encoded}`;
}

export function irealDestination(song: IRealSong): IRealDestination | null {
  const direct = song.irealDisabled ? null : irealAppUrl(song.irealUrl);
  if (direct) return { kind: 'direct', url: direct };
  const search = irealSearchUrl(song.title);
  return search ? { kind: 'search', url: search } : null;
}

export function sortedSongDestinations(destinations: SongDestination[]): SongDestination[] {
  return [...destinations].sort((a, b) => {
    if (!a.date && !b.date) return a.name.localeCompare(b.name);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return Date.parse(a.date) - Date.parse(b.date);
  });
}

export function songDestinationLabel(destination: SongDestination, locale = 'fr-CH'): string {
  const date = destination.date
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(destination.date))
    : 'Sans date';
  return [destination.name, date, destination.type, destination.groupName]
    .filter(Boolean)
    .join(' · ');
}

export type ConversationKind = 'direct' | 'music-group' | 'school';

export function isConversationKindVisible(kind: ConversationKind): boolean {
  return kind !== 'school';
}
