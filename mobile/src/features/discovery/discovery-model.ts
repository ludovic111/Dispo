import type { ProfileSummary } from '@/domain/profile';
import type { GigSummary } from '@/features/gigs/gig-model';

export type AvailabilityScope = 'nearby' | 'today' | 'weekend';

export interface DiscoveryFilters {
  friendsOnly: boolean;
  genres: string[];
  instruments: string[];
  levels: string[];
  neededDate: string | null;
  place: string;
  playedWithFriend: boolean;
  radiusKm: number;
  sameSchoolOnly: boolean;
}

export const defaultDiscoveryFilters: DiscoveryFilters = {
  friendsOnly: false,
  genres: [],
  instruments: [],
  levels: [],
  neededDate: null,
  place: '',
  playedWithFriend: false,
  radiusKm: 25,
  sameSchoolOnly: false,
};

const stopWords = new Set([
  'a',
  'au',
  'aux',
  'avec',
  'besoin',
  'cherche',
  'd',
  'de',
  'des',
  'du',
  'en',
  'et',
  'je',
  'l',
  'la',
  'le',
  'les',
  'ou',
  'pour',
  'qui',
  'recherche',
  'sur',
  'trouve',
  'un',
  'une',
  'veux',
]);

const instrumentAliases: Record<string, readonly string[]> = {
  Batterie: ['batteur', 'batteuse', 'drums'],
  Basse: ['bassiste', 'bass'],
  Chant: ['chanteur', 'chanteuse', 'vocaliste'],
  Contrebasse: ['contrebassiste', 'upright'],
  Guitare: ['guitariste', 'guitar'],
  Piano: ['pianiste', 'pianist'],
  Saxophone: ['saxophoniste', 'sax'],
  Trompette: ['trompettiste', 'trumpet'],
  Violon: ['violoniste', 'violin'],
  Voix: ['chanteur', 'chanteuse', 'chant', 'vocaliste'],
};

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

export function searchTokens(value: string): string[] {
  return normalizeSearch(value)
    .split(/[^\p{L}\p{N}@]+/u)
    .map((token) => token.replace(/^@/, ''))
    .filter((token) => token.length > 0 && !stopWords.has(token));
}

export function boundedEditDistance(a: string, b: string, limit: number): number {
  const left = [...a];
  const right = [...b];
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    let rowMinimum = leftIndex + 1;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      const value = Math.min(
        (previous[rightIndex] ?? 0) + cost,
        (previous[rightIndex + 1] ?? 0) + 1,
        (current[rightIndex] ?? 0) + 1,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length] ?? limit + 1;
}

function normalizedWords(parts: readonly string[]): string[] {
  return parts.flatMap((part) =>
    normalizeSearch(part)
      .split(/[\s.]+/)
      .filter(Boolean),
  );
}

function tokenMatches(token: string, words: readonly string[]): boolean {
  return words.some((word) => {
    if (word.startsWith(token)) return true;
    if (token.length >= 3 && word.includes(token)) return true;
    if (token.length >= 4 && word.length >= 4 && token.startsWith(word)) return true;
    if (token.length >= 4) {
      const tolerance = token.length >= 7 ? 2 : 1;
      return boundedEditDistance(token, word, tolerance) <= tolerance;
    }
    return false;
  });
}

function matchCount(tokens: readonly string[], words: readonly string[]): number {
  return tokens.reduce((count, token) => count + Number(tokenMatches(token, words)), 0);
}

function profileWords(profile: ProfileSummary): string[] {
  const handle = normalizeSearch(profile.name).replace(/\s+/g, '.');
  return normalizedWords([
    profile.name,
    handle,
    handle.replaceAll('.', ''),
    profile.bio,
    profile.city ?? '',
    profile.postalCode ?? '',
    profile.country ?? '',
    profile.level,
    ...profile.instruments,
    ...profile.instruments.flatMap((instrument) => instrumentAliases[instrument] ?? []),
    ...profile.genres,
    ...(profile.availabilityPlaces ?? []).flatMap((place) => [
      place.city,
      place.postalCode ?? '',
      place.country ?? '',
    ]),
    ...profile.schools.flatMap((school) => [school.name, school.shortName ?? '']),
  ]);
}

function gigWords(gig: GigSummary): string[] {
  return normalizedWords([
    'sos',
    gig.title,
    gig.place,
    gig.hostName,
    gig.genre,
    ...gig.wantedInstruments,
    ...gig.wantedInstruments.flatMap((instrument) => instrumentAliases[instrument] ?? []),
  ]);
}

function bestMatches<T>(scored: readonly { item: T; score: number }[], tokenCount: number): T[] {
  const full = scored.filter((entry) => entry.score === tokenCount);
  return (full.length > 0 ? full : scored.filter((entry) => entry.score > 0)).map(
    (entry) => entry.item,
  );
}

export function searchDiscovery(
  query: string,
  profiles: readonly ProfileSummary[],
  gigs: readonly GigSummary[],
): { gigs: GigSummary[]; profiles: ProfileSummary[] } {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return { gigs: [], profiles: [] };
  const matchedProfiles = bestMatches(
    profiles.map((item) => ({ item, score: matchCount(tokens, profileWords(item)) })),
    tokens.length,
  ).sort(rankProfiles);
  const matchedGigs = bestMatches(
    gigs.map((item) => ({ item, score: matchCount(tokens, gigWords(item)) })),
    tokens.length,
  ).sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  return { gigs: matchedGigs, profiles: matchedProfiles };
}

function dateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isAvailableOn(profile: ProfileSummary, date: Date): boolean {
  const wanted = dateKey(date);
  return profile.availableDates.some((value) => value.slice(0, 10) === wanted);
}

export function availabilityPlaceCovers(
  place: NonNullable<ProfileSummary['availabilityPlaces']>[number],
  date: Date,
): boolean {
  const wanted = dateKey(date);
  return place.from <= wanted && wanted <= place.to;
}

function placeLabel(place: NonNullable<ProfileSummary['availabilityPlaces']>[number]): string {
  return [place.postalCode, place.city, place.country].filter(Boolean).join(' ');
}

export function profilePlaceLabel(profile: ProfileSummary, neededDate?: string | null): string {
  if (neededDate) {
    const trip = (profile.availabilityPlaces ?? []).find((place) =>
      availabilityPlaceCovers(place, new Date(`${neededDate}T12:00:00`)),
    );
    if (trip) return placeLabel(trip);
  }
  return [profile.postalCode, profile.city, profile.country].filter(Boolean).join(' ');
}

export function profileMatchesPlace(
  profile: ProfileSummary,
  requestedPlace: string,
  neededDate?: string | null,
): boolean {
  const needle = normalizeSearch(requestedPlace.trim());
  if (!needle) return true;
  const home = normalizeSearch(profilePlaceLabel(profile));
  if (neededDate) {
    const trip = (profile.availabilityPlaces ?? []).find((place) =>
      availabilityPlaceCovers(place, new Date(`${neededDate}T12:00:00`)),
    );
    return normalizeSearch(trip ? placeLabel(trip) : home).includes(needle);
  }
  return (
    home.includes(needle) ||
    (profile.availabilityPlaces ?? []).some((place) =>
      normalizeSearch(placeLabel(place)).includes(needle),
    )
  );
}

export function weekendDays(now = new Date()): Date[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result: Date[] = [];
  for (let offset = 0; offset <= 7 && result.length < 2; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    if (day.getDay() === 0 || day.getDay() === 6) result.push(day);
  }
  return result;
}

export function activeFilterCount(filters: DiscoveryFilters): number {
  return [
    filters.instruments.length > 0,
    filters.genres.length > 0,
    filters.levels.length > 0,
    Boolean(filters.neededDate),
    filters.radiusKm !== 25,
    filters.friendsOnly,
    filters.playedWithFriend,
    filters.sameSchoolOnly,
    Boolean(filters.place.trim()),
  ].filter(Boolean).length;
}

export function distanceKm(
  from: Pick<ProfileSummary, 'latitude' | 'longitude'>,
  to: Pick<ProfileSummary, 'latitude' | 'longitude'>,
): number | null {
  if (
    from.latitude === null ||
    from.longitude === null ||
    to.latitude === null ||
    to.longitude === null
  ) {
    return null;
  }
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchesDiscoveryFilters(
  profile: ProfileSummary,
  filters: DiscoveryFilters,
  currentProfile: ProfileSummary | null,
): boolean {
  if (
    filters.instruments.length > 0 &&
    !profile.instruments.some((instrument) => filters.instruments.includes(instrument))
  ) {
    return false;
  }
  if (
    filters.genres.length > 0 &&
    !profile.genres.some((genre) => filters.genres.includes(genre))
  ) {
    return false;
  }
  if (filters.levels.length > 0) {
    const relevant =
      filters.instruments.length > 0
        ? profile.instruments.filter((instrument) => filters.instruments.includes(instrument))
        : profile.instruments;
    const levels = relevant.map(
      (instrument) => profile.instrumentLevels[instrument] ?? profile.level,
    );
    if (!levels.some((level) => filters.levels.includes(level))) return false;
  }
  if (filters.neededDate && !isAvailableOn(profile, new Date(`${filters.neededDate}T12:00:00`))) {
    return false;
  }
  if (!profileMatchesPlace(profile, filters.place, filters.neededDate)) {
    return false;
  }
  const distance = currentProfile ? distanceKm(currentProfile, profile) : null;
  if (distance !== null && distance > filters.radiusKm) return false;
  if (filters.friendsOnly && !profile.isFriend) return false;
  if (filters.playedWithFriend && !profile.playedWithFriend) return false;
  if (filters.sameSchoolOnly && !profile.sharesSchool) return false;
  return true;
}

export function rankProfiles(left: ProfileSummary, right: ProfileSummary): number {
  const levelRank: Record<string, number> = {
    Avancé: 3,
    Débutant: 1,
    Intermédiaire: 2,
    Pro: 4,
    Professionnel: 4,
  };
  const score = (profile: ProfileSummary) => {
    const relation = profile.isFriend
      ? 40
      : profile.playedWithFriend
        ? 30
        : profile.relationship !== 'none'
          ? 20
          : 0;
    const strongestLevel = Math.max(
      levelRank[profile.level] ?? 0,
      ...Object.values(profile.instrumentLevels).map((level) => levelRank[level] ?? 0),
    );
    const availableSoon = Number(
      profile.availableDates.some((date) => date.slice(0, 10) >= dateKey(new Date())),
    );
    return relation * 100 + strongestLevel * 10 + availableSoon;
  };
  return score(right) - score(left) || left.name.localeCompare(right.name, 'fr');
}

export function profilesForScope(
  profiles: readonly ProfileSummary[],
  scope: AvailabilityScope,
  now = new Date(),
): ProfileSummary[] {
  if (scope === 'today') return profiles.filter((profile) => isAvailableOn(profile, now));
  if (scope === 'weekend') {
    const days = weekendDays(now);
    return profiles.filter((profile) => days.some((day) => isAvailableOn(profile, day)));
  }
  return [...profiles];
}

export function openingScope(
  profiles: readonly ProfileSummary[],
  now = new Date(),
): AvailabilityScope {
  if (profilesForScope(profiles, 'today', now).length > 0) return 'today';
  if (profilesForScope(profiles, 'weekend', now).length > 0) return 'weekend';
  return 'nearby';
}
