export type GigApplicationStatus = 'accepted' | 'declined' | 'pending';
export type DirectGigStatus = 'accepted' | 'declined' | 'pending';
export type PrivateLocationState = 'absent' | 'available' | 'restricted' | 'unknown';
export type FeeMode = 'amount' | 'negotiable' | 'none';

export interface GigApplication {
  createdAt: string;
  hostContactedAt: string | null;
  id: string;
  instrument: string | null;
  /** Critères de matching calculés par le serveur (hôte seulement). */
  match?: GigMatchInfo;
  message: string;
  musicianId: string;
  /** Membre Premium (abonnement ou école) : coche bleue à côté du nom. */
  musicianIsPremium?: boolean;
  musicianLevel?: string;
  musicianName: string;
  musicianPhotoUrl: string | null;
  status: GigApplicationStatus;
}

export interface GigLocation {
  city: string | null;
  countryCode: string | null;
  exactAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  postalCode: string | null;
  state: PrivateLocationState;
}

export interface GigSummary {
  date: string;
  description: string | null;
  eventId: string | null;
  fee: number | null;
  filledInstruments: string[];
  genre: string;
  groupId: string | null;
  hostId: string;
  /** Membre Premium (abonnement ou école) : coche bleue à côté du nom. */
  hostIsPremium?: boolean;
  hostName: string;
  hostPhotoUrl: string | null;
  hostSchoolIds?: string[];
  wantedSchoolIds?: string[];
  id: string;
  isFresh?: boolean;
  isLocked: boolean;
  neighborhood: string;
  paymentMethod: string | null;
  pendingApplicantCount?: number;
  place: string;
  postedAt: string | null;
  targetId: string | null;
  targetStatus: DirectGigStatus | null;
  title: string;
  wantedInstruments: string[];
  wantedLevels: string[];
}

export interface GigDetail extends GigSummary {
  applicants: GigApplication[];
  location: GigLocation;
  myApplication: GigApplication | null;
}

export interface GigCreateInput {
  wantedSchoolIds?: string[];
  city: string;
  countryCode: string;
  date: string;
  description: string;
  exactAddress: string;
  eventId?: string | null;
  feeAmount: string;
  feeMode: FeeMode;
  genre: string;
  groupId?: string | null;
  hostId: string;
  latitude?: number | null;
  longitude?: number | null;
  paymentMethod: string;
  postalCode: string;
  publicPlace: string;
  targetId: string | null;
  title: string;
  wantedInstruments: string[];
  wantedLevels: string[];
}

export interface GigInsertPayload {
  wanted_school_ids?: string[];
  date: string;
  description: string;
  event_id: string | null;
  fee: number | null;
  genre: string;
  group_id: string | null;
  host_id: string;
  neighborhood: string;
  payment_method: string | null;
  place: string;
  public_location_label: string;
  target_id: string | null;
  target_status: DirectGigStatus | null;
  title: string;
  wanted_instruments: string[];
  wanted_levels: string[] | null;
}

export interface GigLocationWrite {
  city: string;
  countryCode: string;
  exactAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  postalCode: string;
  publicLocationLabel: string;
}

export interface GigWritePlan {
  insert: GigInsertPayload;
  location: GigLocationWrite;
}

export interface GigFormDefaults {
  city: string;
  countryCode: string;
  genres: string[];
  isProfessional: boolean;
  postalCode: string;
}

export const GIG_LEVELS = ['Débutant', 'Intermédiaire', 'Avancé', 'Professionnel'] as const;

export const GIG_GENRE_GROUPS = [
  {
    label: '🎷 Jazz',
    values: [
      'Jazz',
      'Bebop / Hard bop',
      'Swing / Big band',
      'Jazz fusion',
      'Jazz manouche',
      'Free jazz',
      'Smooth jazz',
    ],
  },
  {
    label: '🪘 Latin & World',
    values: [
      'Latin / World',
      'Salsa / Timba',
      'Bossa nova / MPB',
      'Cumbia',
      'Tango',
      'Afro-cubain',
      'Reggae / Ska',
      'Afrobeat / Highlife',
      'Flamenco',
      'Musique orientale',
      'Balkan / Klezmer',
    ],
  },
  {
    label: '🎻 Classique',
    values: [
      'Classique',
      'Baroque',
      'Opéra / Lyrique',
      'Musique de chambre',
      'Musique contemporaine',
    ],
  },
  {
    label: '🎸 Rock & Pop',
    values: [
      'Rock / Pop',
      'Indie / Alternatif',
      'Hard rock / Metal',
      'Punk / Garage',
      'Pop / Variété',
      'Chanson française',
    ],
  },
  {
    label: '🤠 Blues & Country',
    values: ['Blues', 'Country / Bluegrass', "Rock'n'roll / Rockabilly"],
  },
  {
    label: '🎤 Soul & Funk',
    values: ['Gospel / Soul / R&B', 'Funk', 'Disco'],
  },
  {
    label: '🎧 Hip-hop & Urbain',
    values: ['Hip-hop / Rap', 'R&B moderne / Neo-soul'],
  },
  {
    label: '🎛️ Électronique',
    values: ['Électronique', 'House', 'Techno', 'Drum & bass', 'Ambient / Downtempo'],
  },
  {
    label: '🪕 Folk & Acoustique',
    values: ['Folk / Acoustique', 'Singer-songwriter', 'Musique celtique'],
  },
] as const;

export const GIG_INSTRUMENT_GROUPS = [
  { label: 'Claviers', values: ['Piano', 'Synthé / MAO', 'Orgue', 'Accordéon'] },
  {
    label: 'Cordes',
    values: [
      'Guitare',
      'Guitare électrique',
      'Basse',
      'Contrebasse',
      'Violon',
      'Alto',
      'Violoncelle',
      'Harpe',
      'Banjo',
      'Mandoline',
      'Ukulélé',
    ],
  },
  {
    label: 'Vents & cuivres',
    values: [
      'Saxophone alto',
      'Saxophone ténor',
      'Trompette',
      'Trombone',
      'Clarinette',
      'Flûte',
      'Cor',
      'Tuba',
      'Harmonica',
    ],
  },
  {
    label: 'Batterie & percussions',
    values: ['Batterie', 'Percussions', 'Cajón', 'Congas', 'Timbales', 'Vibraphone'],
  },
  { label: 'Voix', values: ['Voix', 'Chœurs', 'Beatbox'] },
  { label: 'DJ & électro', values: ['DJ / Platines'] },
] as const;

export const GIG_PAYMENT_METHODS = [
  { label: 'Twint', value: 'twint' },
  { label: 'Virement', value: 'transfer' },
  { label: 'Espèces', value: 'cash' },
  { label: 'Cash App', value: 'cashapp' },
] as const;

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function uniqueClean(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function publicAreaLabel(postalCode: string, city: string, countryCode: string): string {
  const area = [clean(postalCode), clean(city)].filter(Boolean).join(' ');
  const country = clean(countryCode).toUpperCase();
  return country ? `${area} · ${country}` : area;
}

export function combineGigDate(day: string, time: string): string {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!dayMatch || !timeMatch) throw new Error('gig_date_invalid');
  const year = Number(dayMatch[1]);
  const month = Number(dayMatch[2]);
  const date = Number(dayMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const parsed = new Date(year, month - 1, date, hour, minute, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== date ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    throw new Error('gig_date_invalid');
  }
  return parsed.toISOString();
}

export function defaultGigDate(now = new Date()): { day: string; time: string } {
  const value = new Date(now);
  value.setDate(value.getDate() + 1);
  value.setHours(20, 0, 0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return { day: local.toISOString().slice(0, 10), time: '20:00' };
}

export function validateGigCreate(input: GigCreateInput, now = new Date()): string[] {
  const errors: string[] = [];
  if (!clean(input.hostId)) errors.push('gig_host_missing');
  if (!clean(input.title)) errors.push('gig_title_missing');
  const parsed = new Date(input.date);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() < now.getTime())
    errors.push('gig_date_invalid');
  if (!clean(input.genre)) errors.push('gig_genre_missing');
  if (!clean(input.countryCode) || !clean(input.postalCode) || !clean(input.city)) {
    errors.push('gig_public_area_incomplete');
  }
  if (uniqueClean(input.wantedInstruments).length === 0) errors.push('gig_instrument_missing');
  if (input.feeMode === 'amount') {
    const amount = Number(input.feeAmount);
    if (!/^\d+$/.test(input.feeAmount.trim()) || !Number.isSafeInteger(amount) || amount <= 0) {
      errors.push('gig_fee_invalid');
    }
  }
  if (clean(input.exactAddress).length > 600) errors.push('gig_exact_address_too_long');
  return errors;
}

export function createGigWritePlan(
  input: GigCreateInput,
  now = new Date(),
  preserveLinkedLocation = false,
): GigWritePlan {
  const errors = validateGigCreate(input, now).filter(
    (code) => !(preserveLinkedLocation && input.eventId && code === 'gig_public_area_incomplete'),
  );
  if (errors[0]) throw new Error(errors[0]);
  const area = publicAreaLabel(input.postalCode, input.city, input.countryCode);
  const publicPlace = clean(input.publicPlace) || area;
  const exactAddress = clean(input.exactAddress);
  const fee =
    input.feeMode === 'amount' ? Number(input.feeAmount) : input.feeMode === 'none' ? 0 : null;
  const paymentMethod = input.feeMode === 'none' ? null : clean(input.paymentMethod) || null;
  const targetId = clean(input.targetId ?? '') || null;
  return {
    insert: {
      date: new Date(input.date).toISOString(),
      description: clean(input.description),
      event_id: clean(input.eventId ?? '') || null,
      fee,
      genre: clean(input.genre),
      group_id: clean(input.groupId ?? '') || null,
      host_id: clean(input.hostId),
      neighborhood: area,
      payment_method: paymentMethod,
      place: publicPlace,
      public_location_label: publicPlace,
      target_id: targetId,
      target_status: targetId ? 'pending' : null,
      title: clean(input.title),
      wanted_instruments: uniqueClean(input.wantedInstruments),
      ...(input.wantedSchoolIds ? { wanted_school_ids: [...new Set(input.wantedSchoolIds)] } : {}),
      wanted_levels: uniqueClean(input.wantedLevels).length
        ? uniqueClean(input.wantedLevels)
        : null,
    },
    location: {
      city: clean(input.city),
      countryCode: clean(input.countryCode).toUpperCase(),
      exactAddress: exactAddress || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      postalCode: clean(input.postalCode),
      publicLocationLabel: publicPlace,
    },
  };
}

export function openGigInstruments(
  gig: Pick<GigSummary, 'filledInstruments' | 'wantedInstruments'>,
): string[] {
  const filled = new Set(gig.filledInstruments);
  return gig.wantedInstruments.filter((instrument) => !filled.has(instrument));
}

export interface HostedGigTriage {
  hosted: GigSummary[];
  pendingApplicantCount: number;
  sentDirect: GigSummary[];
}

/** Mirrors the SwiftUI "Mes SOS" order: decisions first, then direct requests, then dates. */
export function triageHostedGigs(gigs: readonly GigSummary[]): HostedGigTriage {
  const byPriorityThenDate = (a: GigSummary, b: GigSummary) => {
    const pendingDelta = (b.pendingApplicantCount ?? 0) - (a.pendingApplicantCount ?? 0);
    if (pendingDelta !== 0) return pendingDelta;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  };
  const hosted = gigs.filter((gig) => gig.targetId === null).sort(byPriorityThenDate);
  const sentDirect = gigs
    .filter((gig) => gig.targetId !== null)
    .sort((a, b) => {
      const pendingA = a.targetStatus === 'pending' ? 0 : 1;
      const pendingB = b.targetStatus === 'pending' ? 0 : 1;
      return pendingA - pendingB || new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  return {
    hosted,
    pendingApplicantCount: hosted.reduce(
      (count, gig) => count + (gig.pendingApplicantCount ?? 0),
      0,
    ),
    sentDirect,
  };
}

/** Legacy applications could predate the mandatory instrument slot. Keep them actionable. */
export function unslottedGigApplicants(
  gig: Pick<GigDetail, 'applicants' | 'wantedInstruments'>,
): GigApplication[] {
  const slots = new Set(gig.wantedInstruments);
  return gig.applicants.filter(
    (applicant) => !applicant.instrument || !slots.has(applicant.instrument),
  );
}

export type GigViewerAction =
  | 'application-accepted'
  | 'application-declined'
  | 'application-pending'
  | 'apply'
  | 'direct-accepted'
  | 'direct-declined'
  | 'direct-pending'
  | 'filled'
  | 'locked'
  | 'organizer';

export function gigViewerAction(gig: GigDetail, userId: string): GigViewerAction {
  if (gig.hostId === userId) return 'organizer';
  if (gig.targetId === userId) {
    if (gig.targetStatus === 'accepted') return 'direct-accepted';
    if (gig.targetStatus === 'declined') return 'direct-declined';
    return 'direct-pending';
  }
  if (gig.myApplication?.status === 'accepted') return 'application-accepted';
  if (gig.myApplication?.status === 'declined') return 'application-declined';
  if (gig.myApplication?.status === 'pending') return 'application-pending';
  if (openGigInstruments(gig).length === 0) return 'filled';
  if (gig.isLocked) return 'locked';
  return 'apply';
}

export interface GigLocationRpcRow {
  city: string | null;
  country_code: string | null;
  exact_address: string | null;
  latitude: number | null;
  longitude: number | null;
  postal_code: string | null;
}

export function resolveGigLocation(row: GigLocationRpcRow | null, rpcFailed = false): GigLocation {
  if (rpcFailed) {
    return {
      city: null,
      countryCode: null,
      exactAddress: null,
      latitude: null,
      longitude: null,
      postalCode: null,
      state: 'unknown',
    };
  }
  if (!row) {
    return {
      city: null,
      countryCode: null,
      exactAddress: null,
      latitude: null,
      longitude: null,
      postalCode: null,
      state: 'restricted',
    };
  }
  const exactAddress = clean(row.exact_address ?? '') || null;
  return {
    city: row.city,
    countryCode: row.country_code,
    exactAddress,
    latitude: row.latitude,
    longitude: row.longitude,
    postalCode: row.postal_code,
    state: exactAddress ? 'available' : 'absent',
  };
}

export function directResponseParams(gigId: string, accept: boolean) {
  if (!gigId) throw new Error('gig_id_missing');
  return { p_accept: accept, p_gig: gigId };
}

export function applicationDecisionParams(applicationId: string) {
  if (!applicationId) throw new Error('gig_application_missing');
  return { application_id: applicationId };
}

// ---------------------------------------------------------------------------
// Matching 2.5 — calculé par le serveur (private.gig_profile_match)
// ---------------------------------------------------------------------------

export type GigMatchRelation = 'follower' | 'following' | 'mutual' | 'none';

export interface GigMatchInfo {
  availableOnDate: boolean;
  away: boolean;
  awayIn: string | null;
  commonGenres: string[];
  commonSongs: { count: number; titles: string[] };
  distanceKm: number | null;
  instruments: string[];
  levelOk: boolean;
  reasons: string[];
  relation: GigMatchRelation;
  schoolOk: boolean;
  schools: string[];
  score: number;
  timeSlotOk: boolean;
}

export interface GigCandidateProfile {
  city: string | null;
  genres: string[];
  id: string;
  instruments: string[];
  isPremium: boolean;
  level: string;
  name: string;
  photoUrl: string | null;
}

export interface GigCandidate {
  match: GigMatchInfo;
  profile: GigCandidateProfile;
}

/** Une annonce du fil vue par le viewer, avec son score de compatibilité. */
export interface GigViewerMatch {
  gigId: string;
  date: string;
  hostId: string;
  match: GigMatchInfo;
  targetId: string | null;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export const EMPTY_GIG_MATCH: GigMatchInfo = {
  availableOnDate: false,
  away: false,
  awayIn: null,
  commonGenres: [],
  commonSongs: { count: 0, titles: [] },
  distanceKm: null,
  instruments: [],
  levelOk: false,
  reasons: [],
  relation: 'none',
  schoolOk: true,
  schools: [],
  score: 0,
  timeSlotOk: false,
};

/** Tolère un JSON serveur partiel : un critère absent est simplement faux. */
export function parseGigMatch(value: unknown): GigMatchInfo {
  if (!isRecord(value)) return EMPTY_GIG_MATCH;
  const songs = isRecord(value.common_songs) ? value.common_songs : {};
  const relation = value.relation;
  const score = typeof value.score === 'number' ? Math.round(value.score) : 0;
  return {
    availableOnDate: value.available_on_date === true,
    away: value.away === true,
    awayIn: optionalString(value.away_in),
    commonGenres: stringList(value.common_genres),
    commonSongs: {
      count: typeof songs.count === 'number' ? songs.count : 0,
      titles: stringList(songs.titles),
    },
    distanceKm: typeof value.distance_km === 'number' ? value.distance_km : null,
    instruments: stringList(value.instruments),
    levelOk: value.level_ok === true,
    reasons: stringList(value.reasons),
    relation:
      relation === 'mutual' || relation === 'following' || relation === 'follower'
        ? relation
        : 'none',
    schoolOk: value.school_ok !== false,
    schools: stringList(value.schools),
    score: Math.min(100, Math.max(0, score)),
    timeSlotOk: value.time_slot_ok === true,
  };
}

export function parseGigCandidateProfile(value: unknown): GigCandidateProfile | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null;
  return {
    city: optionalString(value.city),
    genres: stringList(value.genres),
    id: value.id,
    instruments: stringList(value.instruments),
    isPremium: value.is_premium === true,
    level: typeof value.level === 'string' ? value.level : '',
    name: typeof value.name === 'string' ? value.name : '',
    photoUrl: optionalString(value.photo_url),
  };
}

export function parseGigCandidate(value: unknown): GigCandidate | null {
  if (!isRecord(value)) return null;
  const profile = parseGigCandidateProfile(value.profile);
  if (!profile) return null;
  return { match: parseGigMatch(value.match), profile };
}

export function parseGigViewerMatch(value: unknown): GigViewerMatch | null {
  if (!isRecord(value) || !isRecord(value.gig)) return null;
  const gig = value.gig;
  if (typeof gig.id !== 'string' || typeof gig.date !== 'string' || typeof gig.host_id !== 'string')
    return null;
  return {
    date: gig.date,
    gigId: gig.id,
    hostId: gig.host_id,
    match: parseGigMatch(value.match),
    targetId: optionalString(gig.target_id),
    title: typeof gig.title === 'string' ? gig.title : '',
  };
}

export type GigMatchChipTone = 'info' | 'ok' | 'warn';

export interface GigMatchChip {
  icon?: string;
  key: string;
  label: string;
  tone: GigMatchChipTone;
}

/** `host` : l'hôte regarde un musicien · `viewer` : le musicien regarde une annonce. */
export type GigMatchPerspective = 'host' | 'viewer';

export interface GigMatchChipOptions {
  /** Date du SOS formatée (« jeu. 24 sept. »). */
  dateLabel: string;
  /** Niveau court déjà traduit, s'il est connu. */
  levelLabel?: string | null;
  /** Le SOS demande un niveau : la puce niveau devient ✓/✗. */
  levelWanted: boolean;
  perspective: GigMatchPerspective;
  /** Le SOS exige une école : la puce école devient ✓/✗. */
  schoolWanted: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * Toutes les puces d'un match, dans l'ordre de lecture : instrument, niveau,
 * date, créneau, absence, école, styles, morceaux, distance, relation.
 */
export function gigMatchChips(match: GigMatchInfo, options: GigMatchChipOptions): GigMatchChip[] {
  const { t } = options;
  const chips: GigMatchChip[] = match.instruments.map((instrument) => ({
    icon: 'musical-notes',
    key: `instrument:${instrument}`,
    label: t(instrument),
    tone: 'ok',
  }));
  if (options.levelWanted || options.levelLabel) {
    const level = options.levelLabel ? t(options.levelLabel) : t('Niveau');
    chips.push(
      options.levelWanted
        ? {
            key: 'level',
            label: match.levelOk ? `${level} ✓` : `${level} ✗`,
            tone: match.levelOk ? 'ok' : 'warn',
          }
        : { key: 'level', label: level, tone: 'info' },
    );
  }
  chips.push({
    icon: 'calendar-outline',
    key: 'available',
    label: match.availableOnDate
      ? t('Dispo le {{date}} ✓', { date: options.dateLabel })
      : t('Dispo le {{date}} ✗', { date: options.dateLabel }),
    tone: match.availableOnDate ? 'ok' : 'warn',
  });
  if (match.timeSlotOk) chips.push({ key: 'time_slot', label: t('Créneau ✓'), tone: 'ok' });
  if (match.away) {
    chips.push({
      icon: 'airplane-outline',
      key: 'away',
      label: match.awayIn ? t('Absent·e ({{city}})', { city: match.awayIn }) : t('Absent·e'),
      tone: 'warn',
    });
  }
  if (match.schools.length > 0) {
    chips.push({
      icon: 'school-outline',
      key: 'school',
      label: options.schoolWanted ? `${match.schools.join(' · ')} ✓` : match.schools.join(' · '),
      tone: 'ok',
    });
  } else if (options.schoolWanted) {
    chips.push({
      icon: 'school-outline',
      key: 'school',
      label: match.schoolOk ? t('École ✓') : t('École ✗'),
      tone: match.schoolOk ? 'ok' : 'warn',
    });
  }
  for (const genre of match.commonGenres.slice(0, 3)) {
    chips.push({ key: `genre:${genre}`, label: t(genre), tone: 'info' });
  }
  if (match.commonSongs.count > 0) {
    chips.push({
      icon: 'musical-note',
      key: 'songs',
      label:
        match.commonSongs.count === 1
          ? t('1 morceau en commun')
          : t('{{count}} morceaux en commun', { count: match.commonSongs.count }),
      tone: 'ok',
    });
  }
  if (match.distanceKm !== null) {
    chips.push({
      icon: 'navigate-outline',
      key: 'distance',
      label: match.distanceKm < 1 ? t('< 1 km') : `${match.distanceKm} km`,
      tone: match.distanceKm <= 10 ? 'ok' : 'info',
    });
  }
  const relation = relationLabel(match.relation, options.perspective, t);
  if (relation)
    chips.push({ icon: 'people-outline', key: 'relation', label: relation, tone: 'ok' });
  return chips;
}

function relationLabel(
  relation: GigMatchRelation,
  perspective: GigMatchPerspective,
  t: GigMatchChipOptions['t'],
): string | null {
  if (relation === 'mutual') return t('Ami·e');
  if (relation === 'none') return null;
  // La relation est stockée du point de vue de l'hôte : `follower` = le
  // musicien suit l'hôte.
  const musicianFollowsHost = relation === 'follower';
  if (perspective === 'host') return musicianFollowsHost ? t('Te suit') : t('Tu suis');
  return musicianFollowsHost ? t('Tu suis') : t('Te suit');
}

/** Les deux raisons à afficher sur une carte du fil, hors instrument. */
export function topGigMatchReasons(match: GigMatchInfo, limit = 2): string[] {
  const priority = ['available', 'time_slot', 'friend', 'follows', 'school', 'near'];
  const ranked = [...match.reasons]
    .filter(
      (reason) => !reason.startsWith('instrument:') && reason !== 'level' && reason !== 'away',
    )
    .sort((a, b) => rank(a, priority) - rank(b, priority));
  return ranked.slice(0, limit);
}

function rank(reason: string, priority: string[]): number {
  const index = priority.indexOf(reason);
  if (index >= 0) return index;
  if (reason.startsWith('songs:')) return priority.length;
  if (reason.startsWith('genres:')) return priority.length + 1;
  return priority.length + 2;
}

export function gigMatchReasonLabel(reason: string, t: GigMatchChipOptions['t']): string {
  if (reason.startsWith('instrument:')) return t(reason.slice('instrument:'.length));
  if (reason.startsWith('genres:')) return t(reason.slice('genres:'.length));
  if (reason.startsWith('songs:')) {
    const count = Number(reason.slice('songs:'.length)) || 0;
    return count === 1 ? t('1 morceau en commun') : t('{{count}} morceaux en commun', { count });
  }
  const labels: Record<string, string> = {
    available: t('Dispo ce jour-là'),
    away: t('Absent·e'),
    follows: t('Vous vous suivez'),
    friend: t('Ami·e'),
    level: t('Niveau ✓'),
    near: t('Tout près'),
    school: t('Même école'),
    time_slot: t('Créneau ✓'),
  };
  return labels[reason] ?? reason;
}

/** Trie le fil : score décroissant pour les annonces compatibles, puis date. */
export function sortGigsByMatch<T extends Pick<GigSummary, 'date' | 'id'>>(
  gigs: readonly T[],
  scores: ReadonlyMap<string, number>,
): T[] {
  return [...gigs].sort((a, b) => {
    const scoreA = scores.get(a.id) ?? -1;
    const scoreB = scores.get(b.id) ?? -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

export interface GigApplyViewer {
  instrumentLevels: Record<string, string>;
  instruments: string[];
  level: string;
}

/** Postes ouverts que le viewer joue au niveau demandé — les seuls proposables. */
export function eligibleApplyInstruments(
  gig: Pick<GigSummary, 'filledInstruments' | 'wantedInstruments' | 'wantedLevels'>,
  viewer: GigApplyViewer,
): string[] {
  const own = new Set(viewer.instruments);
  return openGigInstruments(gig).filter((instrument) => {
    if (!own.has(instrument)) return false;
    if (gig.wantedLevels.length === 0) return true;
    return gig.wantedLevels.includes(viewer.instrumentLevels[instrument] ?? viewer.level);
  });
}

const gigErrorCopy: Record<string, string> = {
  already_contacted: 'Tu as déjà contacté cette personne pour ce SOS.',
  blocked: 'Cette personne n’est pas joignable.',
  cannot_apply_own_gig: 'Tu ne peux pas candidater à ton propre SOS.',
  cannot_target_self: 'Tu ne peux pas te demander un dépannage à toi-même.',
  direct_request_pending: 'Tu as déjà une demande en attente auprès de cette personne.',
  gig_expired: 'Ce SOS est passé.',
  instrument_not_open: 'Ce poste n’est plus ouvert.',
  instrument_not_played: 'Cet instrument n’est pas dans ton profil.',
  level_not_wanted: 'Le niveau demandé pour ce poste ne correspond pas au tien.',
  message_invalid: 'Le message doit faire entre 1 et 500 caractères.',
  only_gig_host: 'Seul·e l’organisateur·rice peut faire ça.',
};

/** Code serveur → copie française (clé i18n). Sinon la copie de repli. */
export function gigErrorMessage(error: unknown, fallback: string): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : typeof error === 'string'
        ? error
        : '';
  return gigErrorCopy[message] ?? fallback;
}

export function isGigErrorCode(error: unknown, code: keyof typeof gigErrorCopy): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    (error as { message: unknown }).message === code
  );
}

// ---------------------------------------------------------------------------
// Repli client (aucun écran ne l'utilise depuis 2.5 : le serveur score via
// `gig_candidates`). Conservé pour les tests de parité et un éventuel mode
// hors-ligne.
// ---------------------------------------------------------------------------

export interface GigMatchProfile {
  schoolIds?: string[];
  availableDates: string[];
  genres: string[];
  id: string;
  instruments: string[];
  isDemo?: boolean;
  level: string;
  name: string;
  photoUrl: string | null;
  relationRank: number;
}

export interface GigMatch extends GigMatchProfile {
  dateConfirmed: boolean;
  matchingInstruments: string[];
}

const levelRanks = new Map<string, number>(GIG_LEVELS.map((level, index) => [level, index]));

function localDayKey(value: string | Date): string {
  const parsed = typeof value === 'string' ? new Date(value) : value;
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function availabilityRank(dates: string[], now: Date): number {
  const today = localDayKey(now);
  const upcoming = dates.filter((date) => date >= today).sort();
  const first = upcoming[0];
  if (!first) return 0;
  if (first === today) return 4;
  const days = Math.round(
    (new Date(`${first}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) /
      86_400_000,
  );
  if (days <= 7) {
    const weekday = new Date(`${first}T12:00:00`).getDay();
    return weekday === 0 || weekday === 6 ? 2 : 3;
  }
  return 1;
}

export function matchProfilesToGig(
  gig: Pick<GigSummary, 'date' | 'genre' | 'hostId' | 'wantedInstruments' | 'wantedSchoolIds'>,
  profiles: GigMatchProfile[],
  now = new Date(),
): GigMatch[] {
  const gigDay = localDayKey(gig.date);
  const wanted = new Set(gig.wantedInstruments);
  return profiles
    .filter((profile) => profile.id !== gig.hostId)
    .filter(
      (profile) =>
        !gig.wantedSchoolIds?.length ||
        profile.schoolIds?.some((id) => gig.wantedSchoolIds?.includes(id)),
    )
    .map((profile): GigMatch | null => {
      const matchingInstruments = profile.instruments.filter((instrument) =>
        wanted.has(instrument),
      );
      if (matchingInstruments.length === 0 || availabilityRank(profile.availableDates, now) === 0) {
        return null;
      }
      return {
        ...profile,
        dateConfirmed: profile.availableDates.includes(gigDay),
        matchingInstruments,
      };
    })
    .filter((match): match is GigMatch => match !== null)
    .sort((a, b) => {
      if (a.dateConfirmed !== b.dateConfirmed) return a.dateConfirmed ? -1 : 1;
      const genreA = a.genres.includes(gig.genre);
      const genreB = b.genres.includes(gig.genre);
      if (genreA !== genreB) return genreA ? -1 : 1;
      if (a.relationRank !== b.relationRank) return b.relationRank - a.relationRank;
      const levelA = levelRanks.get(a.level) ?? -1;
      const levelB = levelRanks.get(b.level) ?? -1;
      if (levelA !== levelB) return levelB - levelA;
      const availabilityA = availabilityRank(a.availableDates, now);
      const availabilityB = availabilityRank(b.availableDates, now);
      if (availabilityA !== availabilityB) return availabilityB - availabilityA;
      return a.name.localeCompare(b.name, 'fr');
    });
}
