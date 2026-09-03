import { shortProfileLevel, type ProfileSummary } from '@/domain/profile';
import { GIG_GENRE_GROUPS, type GigSummary } from '@/features/gigs/gig-model';

export type AvailabilityScope = 'nearby' | 'today' | 'weekend';

export interface DiscoveryFilters {
  friendsOnly: boolean;
  genres: string[];
  instruments: string[];
  levels: string[];
  neededDate: string | null;
  placeCity: string;
  placeCountry: string;
  placePostalCode: string;
  playedWithFriend: boolean;
  radiusKm: number;
  sameSchoolOnly: boolean;
  schoolIds: string[];
  wellRated: boolean;
}

export const defaultDiscoveryFilters: DiscoveryFilters = {
  friendsOnly: false,
  genres: [],
  instruments: [],
  levels: [],
  neededDate: null,
  placeCity: '',
  placeCountry: '',
  placePostalCode: '',
  playedWithFriend: false,
  radiusKm: 25,
  sameSchoolOnly: false,
  schoolIds: [],
  wellRated: false,
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
  Accordéon: ['accordéoniste'],
  Alto: ['altiste'],
  Banjo: ['banjoïste'],
  Batterie: ['batteur', 'batteuse', 'drummer', 'drums'],
  Basse: ['bassiste', 'bass'],
  Beatbox: ['beatboxer'],
  Cajón: ['percussionniste'],
  Chant: ['chanteur', 'chanteuse', 'vocaliste'],
  Chœurs: ['choriste'],
  Clarinette: ['clarinettiste'],
  Congas: ['conguero', 'percussionniste'],
  Contrebasse: ['contrebassiste', 'upright'],
  Cor: ['corniste'],
  'DJ / Platines': ['deejay', 'platines'],
  Flûte: ['flûtiste'],
  Guitare: ['guitariste', 'guitar'],
  'Guitare électrique': ['guitariste'],
  Harmonica: ['harmoniciste'],
  Harpe: ['harpiste'],
  Mandoline: ['mandoliniste'],
  Orgue: ['organiste'],
  Percussions: ['percussionniste', 'percu'],
  Piano: ['pianiste', 'pianist', 'claviériste', 'keys'],
  Saxophone: ['saxophoniste', 'sax', 'saxo'],
  'Saxophone alto': ['saxophoniste', 'sax', 'saxo', 'alto', 'eb'],
  'Saxophone ténor': ['saxophoniste', 'sax', 'saxo', 'ténor', 'tenor', 'bb'],
  'Synthé / MAO': ['claviériste', 'producteur', 'beatmaker', 'mao'],
  Timbales: ['timbalero', 'percussionniste'],
  Trombone: ['tromboniste'],
  Trompette: ['trompettiste', 'trumpet'],
  Tuba: ['tubiste'],
  Vibraphone: ['vibraphoniste'],
  Violon: ['violoniste', 'violin'],
  Violoncelle: ['violoncelliste', 'celliste'],
  Voix: ['chanteur', 'chanteuse', 'chant', 'vocaliste'],
};

export type AvailabilityStatusKind = 'today' | 'thisWeek' | 'weekend' | 'onRequest' | 'unavailable';

export interface AvailabilityStatus {
  badgeLabel: string;
  kind: AvailabilityStatusKind;
  rawLabel: string;
  urgencyRank: number;
}

export interface DiscoverySearchOptions {
  now?: Date;
  referenceProfile?: ProfileSummary | null;
  translate?: (value: string) => string;
}

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

function translatedTerms(value: string, translate?: (value: string) => string): string[] {
  const translated = translate?.(value);
  return translated && translated !== value ? [value, translated] : [value];
}

export function genreFamilyLabel(genre: string): string | null {
  const group = GIG_GENRE_GROUPS.find(({ values }) =>
    (values as readonly string[]).includes(genre),
  );
  return group?.label.replace(/^[^\p{L}\p{N}]+/u, '') ?? null;
}

function profileWords(
  profile: ProfileSummary,
  now: Date,
  translate?: (value: string) => string,
): string[] {
  const handle = normalizeSearch(profile.name).replace(/\s+/g, '.');
  const availability = profileAvailability(profile, now);
  return normalizedWords([
    profile.name,
    handle,
    handle.replaceAll('.', ''),
    profile.bio,
    profile.city ?? '',
    profile.postalCode ?? '',
    profile.country ?? '',
    profile.level,
    shortProfileLevel(profile.level),
    ...translatedTerms(profile.level, translate),
    ...profile.instruments.flatMap((instrument) => translatedTerms(instrument, translate)),
    ...profile.instruments.flatMap((instrument) => instrumentAliases[instrument] ?? []),
    ...profile.genres.flatMap((genre) => translatedTerms(genre, translate)),
    ...profile.genres.flatMap((genre) => {
      const family = genreFamilyLabel(genre);
      return family ? translatedTerms(family, translate) : [];
    }),
    ...translatedTerms(availability.badgeLabel, translate),
    ...translatedTerms(availability.rawLabel, translate),
    ...(profile.availabilityPlaces ?? []).flatMap((place) => [
      place.city,
      place.postalCode ?? '',
      place.country ?? '',
    ]),
    ...profile.schools.flatMap((school) => [school.name, school.shortName ?? '']),
  ]);
}

function gigWords(gig: GigSummary, translate?: (value: string) => string): string[] {
  const family = genreFamilyLabel(gig.genre);
  return normalizedWords([
    'sos',
    gig.title,
    gig.place,
    gig.neighborhood,
    gig.hostName,
    ...translatedTerms(gig.genre, translate),
    ...(family ? translatedTerms(family, translate) : []),
    ...gig.wantedInstruments.flatMap((instrument) => translatedTerms(instrument, translate)),
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
  options: DiscoverySearchOptions = {},
): { gigs: GigSummary[]; profiles: ProfileSummary[] } {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return { gigs: [], profiles: [] };
  const now = options.now ?? new Date();
  const matchedProfiles = bestMatches(
    profiles.map((item) => ({
      item,
      score: matchCount(tokens, profileWords(item, now, options.translate)),
    })),
    tokens.length,
  ).sort((left, right) => rankProfiles(left, right, options.referenceProfile, now));
  const matchedGigs = bestMatches(
    gigs.map((item) => ({
      item,
      score: matchCount(tokens, gigWords(item, options.translate)),
    })),
    tokens.length,
  ).sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  return { gigs: matchedGigs, profiles: matchedProfiles };
}

export function dateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayNumber(value: string): number {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function profileAvailability(
  profile: Pick<ProfileSummary, 'availableDates'>,
  now = new Date(),
): AvailabilityStatus {
  const today = dateKey(now);
  const first = profile.availableDates
    .map((value) => value.slice(0, 10))
    .filter((value) => value >= today)
    .sort()[0];
  if (!first) {
    return {
      badgeLabel: 'Indispo',
      kind: 'unavailable',
      rawLabel: 'Indisponible',
      urgencyRank: 0,
    };
  }
  if (first === today) {
    return {
      badgeLabel: "Dispo aujourd'hui",
      kind: 'today',
      rawLabel: 'Ce soir',
      urgencyRank: 4,
    };
  }
  const daysAway = dayNumber(first) - dayNumber(today);
  if (daysAway <= 7) {
    const weekday = new Date(`${first}T12:00:00`).getDay();
    if (weekday === 0 || weekday === 6) {
      return {
        badgeLabel: 'Ce week-end',
        kind: 'weekend',
        rawLabel: 'Ce week-end',
        urgencyRank: 2,
      };
    }
    return {
      badgeLabel: 'Cette semaine',
      kind: 'thisWeek',
      rawLabel: 'Cette semaine',
      urgencyRank: 3,
    };
  }
  return {
    badgeLabel: 'Sur demande',
    kind: 'onRequest',
    rawLabel: 'Sur demande',
    urgencyRank: 1,
  };
}

export function hasFutureAvailability(
  profile: Pick<ProfileSummary, 'availableDates'>,
  now = new Date(),
): boolean {
  return profileAvailability(profile, now).kind !== 'unavailable';
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

export function availabilityPlaceForDate(
  profile: Pick<ProfileSummary, 'availabilityPlaces'>,
  value: Date | string,
): NonNullable<ProfileSummary['availabilityPlaces']>[number] | null {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00`) : value;
  return (
    [...(profile.availabilityPlaces ?? [])]
      .filter((place) => availabilityPlaceCovers(place, date))
      .sort((left, right) => left.from.localeCompare(right.from))[0] ?? null
  );
}

function placeLabel(place: NonNullable<ProfileSummary['availabilityPlaces']>[number]): string {
  return [place.postalCode, place.city, place.country].filter(Boolean).join(' ');
}

export function profilePlaceLabel(profile: ProfileSummary, neededDate?: string | null): string {
  if (neededDate) {
    const trip = availabilityPlaceForDate(profile, neededDate);
    if (trip) return placeLabel(trip);
  }
  return [profile.postalCode, profile.city, profile.country].filter(Boolean).join(' ');
}

export function profileMatchesPlace(
  profile: ProfileSummary,
  requestedCity: string,
  neededDate?: string | null,
  requestedPostalCode = '',
  requestedCountry = '',
): boolean {
  const needles = [requestedCity, requestedPostalCode, requestedCountry]
    .map((value) => normalizeSearch(value.trim()))
    .filter(Boolean);
  if (needles.length === 0) return true;
  const home = normalizeSearch(
    [profile.neighborhood, profilePlaceLabel(profile)].filter(Boolean).join(' '),
  );
  if (neededDate) {
    const trip = availabilityPlaceForDate(profile, neededDate);
    const location = normalizeSearch(trip ? placeLabel(trip) : home);
    return needles.every((needle) => location.includes(needle));
  }
  return [
    home,
    ...(profile.availabilityPlaces ?? []).map((place) => normalizeSearch(placeLabel(place))),
  ].some((location) => needles.every((needle) => location.includes(needle)));
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

export function dateForAvailabilityScope(
  scope: AvailabilityScope,
  neededDate: string | null,
  now = new Date(),
): string | null {
  if (scope === 'today') return dateKey(now);
  if (scope === 'weekend') return dateKey(weekendDays(now)[0] ?? now);
  return neededDate?.slice(0, 10) ?? null;
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
    filters.schoolIds.length > 0,
    filters.wellRated,
    Boolean(
      filters.placeCity.trim() || filters.placePostalCode.trim() || filters.placeCountry.trim(),
    ),
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

export function profileDistanceLabel(
  from: Pick<ProfileSummary, 'latitude' | 'longitude'>,
  profile: Pick<ProfileSummary, 'hasExactLocation' | 'latitude' | 'longitude'>,
  locale = 'fr-CH',
): string | null {
  const distance = distanceKm(from, profile);
  if (distance === null) return null;
  if (profile.hasExactLocation) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(distance)} km`;
  }
  return `≈ ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.max(1, Math.round(distance)),
  )} km`;
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
  if (
    !profileMatchesPlace(
      profile,
      filters.placeCity,
      filters.neededDate,
      filters.placePostalCode,
      filters.placeCountry,
    )
  ) {
    return false;
  }
  const distance = currentProfile ? distanceKm(currentProfile, profile) : null;
  if (distance !== null && distance > filters.radiusKm) return false;
  if (filters.friendsOnly && !profile.isFriend) return false;
  if (filters.playedWithFriend && !profile.playedWithFriend) return false;
  if (filters.sameSchoolOnly && !profile.sharesSchool) return false;
  if (
    filters.schoolIds.length > 0 &&
    !profile.schools.some((school) => filters.schoolIds.includes(school.id))
  ) {
    return false;
  }
  if (
    filters.wellRated &&
    (profile.ratingAverage === null || profile.ratingAverage < 4 || profile.ratingCount < 3)
  ) {
    return false;
  }
  return true;
}

export function rankProfiles(
  left: ProfileSummary,
  right: ProfileSummary,
  referenceProfile: ProfileSummary | null = null,
  now = new Date(),
): number {
  const levelRank: Record<string, number> = {
    Avancé: 2,
    Débutant: 0,
    Intermédiaire: 1,
    Pro: 3,
    Professionnel: 3,
  };
  const relationRank = (profile: ProfileSummary) => {
    if (profile.isFriend || profile.relationship === 'friend') return 40;
    if (profile.playedWithFriend) return 30;
    if (profile.relationship === 'following') return 2;
    if (profile.relationship === 'follower') return 1;
    return 0;
  };
  const relationDifference = relationRank(right) - relationRank(left);
  if (relationDifference !== 0) return relationDifference;
  const levelDifference = (levelRank[right.level] ?? 0) - (levelRank[left.level] ?? 0);
  if (levelDifference !== 0) return levelDifference;
  const urgencyDifference =
    profileAvailability(right, now).urgencyRank - profileAvailability(left, now).urgencyRank;
  if (urgencyDifference !== 0) return urgencyDifference;
  if (referenceProfile) {
    const leftDistance = distanceKm(referenceProfile, left);
    const rightDistance = distanceKm(referenceProfile, right);
    if (leftDistance !== null && rightDistance !== null && leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    if (leftDistance !== null && rightDistance === null) return -1;
    if (leftDistance === null && rightDistance !== null) return 1;
  }
  return left.name.localeCompare(right.name, 'fr');
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
