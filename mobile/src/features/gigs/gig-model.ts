export type GigApplicationStatus = 'accepted' | 'declined' | 'pending';
export type DirectGigStatus = 'accepted' | 'declined' | 'pending';
export type PrivateLocationState = 'absent' | 'available' | 'restricted' | 'unknown';
export type FeeMode = 'amount' | 'negotiable' | 'none';

export interface GigApplication {
  createdAt: string;
  id: string;
  instrument: string | null;
  message: string;
  musicianId: string;
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
  hostName: string;
  hostPhotoUrl: string | null;
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

export interface GigMatchProfile {
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
      'Saxophone',
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

const levelRanks = new Map<string, number>(GIG_LEVELS.map((level, index) => [level, index]));

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function uniqueClean(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function publicAreaLabel(postalCode: string, city: string, countryCode: string): string {
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

export function createGigWritePlan(input: GigCreateInput, now = new Date()): GigWritePlan {
  const errors = validateGigCreate(input, now);
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
  gig: Pick<GigSummary, 'date' | 'genre' | 'hostId' | 'wantedInstruments'>,
  profiles: GigMatchProfile[],
  now = new Date(),
): GigMatch[] {
  const gigDay = localDayKey(gig.date);
  const wanted = new Set(gig.wantedInstruments);
  return profiles
    .filter((profile) => profile.id !== gig.hostId)
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

export function directResponseParams(gigId: string, accept: boolean) {
  if (!gigId) throw new Error('gig_id_missing');
  return { p_accept: accept, p_gig: gigId };
}

export function applicationDecisionParams(applicationId: string) {
  if (!applicationId) throw new Error('gig_application_missing');
  return { application_id: applicationId };
}
