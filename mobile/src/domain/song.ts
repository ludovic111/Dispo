export interface CanonicalSong {
  artist: string;
  isrc: string | null;
  title: string;
}

export interface MusicLink {
  platform: string;
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
  return links.filter((link) => /^https:\/\//i.test(link.url));
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
