import type { SupportedLocale } from '@/i18n';

export interface LanguageOption {
  flag: string;
  locale: SupportedLocale;
  nativeName: string;
}

export const languageOptions: readonly LanguageOption[] = [
  { locale: 'fr', nativeName: 'Français', flag: '🇫🇷' },
  { locale: 'en', nativeName: 'English', flag: '🇬🇧' },
  { locale: 'es', nativeName: 'Español', flag: '🇪🇸' },
  { locale: 'de', nativeName: 'Deutsch', flag: '🇩🇪' },
  { locale: 'it', nativeName: 'Italiano', flag: '🇮🇹' },
  { locale: 'zh-Hans', nativeName: '中文', flag: '🇨🇳' },
  { locale: 'ja', nativeName: '日本語', flag: '🇯🇵' },
  { locale: 'pt', nativeName: 'Português', flag: '🇵🇹' },
  { locale: 'ko', nativeName: '한국어', flag: '🇰🇷' },
] as const;

export interface CountryOption {
  code: string;
  flag: string;
  label: string;
}

export const countryOptions: readonly CountryOption[] = [
  { code: 'CH', flag: '🇨🇭', label: 'Suisse' },
  { code: 'FR', flag: '🇫🇷', label: 'France' },
  { code: 'US', flag: '🇺🇸', label: 'États-Unis' },
  { code: 'DE', flag: '🇩🇪', label: 'Allemagne' },
  { code: 'IT', flag: '🇮🇹', label: 'Italie' },
  { code: 'ES', flag: '🇪🇸', label: 'Espagne' },
  { code: 'PT', flag: '🇵🇹', label: 'Portugal' },
  { code: 'BE', flag: '🇧🇪', label: 'Belgique' },
  { code: 'NL', flag: '🇳🇱', label: 'Pays-Bas' },
  { code: 'LU', flag: '🇱🇺', label: 'Luxembourg' },
  { code: 'AT', flag: '🇦🇹', label: 'Autriche' },
  { code: 'GB', flag: '🇬🇧', label: 'Royaume-Uni' },
  { code: 'IE', flag: '🇮🇪', label: 'Irlande' },
  { code: 'CA', flag: '🇨🇦', label: 'Canada' },
  { code: 'DK', flag: '🇩🇰', label: 'Danemark' },
  { code: 'SE', flag: '🇸🇪', label: 'Suède' },
  { code: 'NO', flag: '🇳🇴', label: 'Norvège' },
  { code: 'FI', flag: '🇫🇮', label: 'Finlande' },
  { code: 'PL', flag: '🇵🇱', label: 'Pologne' },
  { code: 'CZ', flag: '🇨🇿', label: 'Tchéquie' },
  { code: 'GR', flag: '🇬🇷', label: 'Grèce' },
  { code: 'AU', flag: '🇦🇺', label: 'Australie' },
  { code: 'NZ', flag: '🇳🇿', label: 'Nouvelle-Zélande' },
  { code: 'BR', flag: '🇧🇷', label: 'Brésil' },
  { code: 'MX', flag: '🇲🇽', label: 'Mexique' },
  { code: 'JP', flag: '🇯🇵', label: 'Japon' },
  { code: 'KR', flag: '🇰🇷', label: 'Corée du Sud' },
] as const;

export interface InstrumentCategory {
  icon: 'headset' | 'mic' | 'musical-note' | 'musical-notes' | 'radio' | 'volume-high';
  instruments: readonly string[];
  label: string;
}

export const instrumentCategories: readonly InstrumentCategory[] = [
  {
    label: 'Claviers',
    icon: 'musical-notes',
    instruments: ['Piano', 'Synthé / MAO', 'Orgue', 'Accordéon'],
  },
  {
    label: 'Cordes',
    icon: 'musical-note',
    instruments: [
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
    icon: 'volume-high',
    instruments: [
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
    icon: 'radio',
    instruments: ['Batterie', 'Percussions', 'Cajón', 'Congas', 'Timbales', 'Vibraphone'],
  },
  {
    label: 'Voix',
    icon: 'mic',
    instruments: ['Voix', 'Chœurs', 'Beatbox'],
  },
  { label: 'DJ & électro', icon: 'headset', instruments: ['DJ / Platines'] },
] as const;

/**
 * Anciennes valeurs d'instrument encore présentes dans des profils, SOS ou rôles de groupe.
 * Le saxophone générique a été retiré des sélecteurs au profit des variantes alto / ténor.
 */
const legacyInstrumentAliases: Readonly<Record<string, string>> = {
  Saxophone: 'Saxophone alto',
};

/** Ramène une valeur historique vers l'instrument proposé aujourd'hui dans les sélecteurs. */
export function normalizeInstrument(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return legacyInstrumentAliases[cleaned] ?? cleaned;
}

/** Normalise une liste d'instruments en conservant l'ordre de première apparition. */
export function normalizeInstruments(instruments: readonly string[]): string[] {
  return [...new Set(instruments.map(normalizeInstrument).filter(Boolean))];
}

export const levelOptions = ['Débutant', 'Intermédiaire', 'Avancé', 'Professionnel'] as const;
export type MusicianLevel = (typeof levelOptions)[number];

export function isMusicianLevel(value: unknown): value is MusicianLevel {
  return typeof value === 'string' && (levelOptions as readonly string[]).includes(value);
}

/**
 * Normalise les niveaux par instrument : anciennes clés ramenées vers l'instrument actuel
 * (la valeur déjà présente sur la clé actuelle est conservée), niveaux inconnus ignorés,
 * instruments absents de la liste ignorés.
 */
export function normalizeInstrumentLevels(
  levels: Readonly<Record<string, unknown>>,
  instruments: readonly string[],
): Record<string, MusicianLevel> {
  const allowed = new Set(normalizeInstruments(instruments));
  const current: Record<string, MusicianLevel> = {};
  const legacy: Record<string, MusicianLevel> = {};
  for (const [rawKey, level] of Object.entries(levels)) {
    if (!isMusicianLevel(level)) continue;
    const trimmed = rawKey.trim().replace(/\s+/g, ' ');
    const key = normalizeInstrument(trimmed);
    if (!allowed.has(key)) continue;
    if (key === trimmed) current[key] = level;
    else legacy[key] ??= level;
  }
  return { ...legacy, ...current };
}

/** Niveau global = le plus élevé des niveaux par instrument, sinon le repli fourni. */
export function globalLevel(
  instrumentLevels: Readonly<Record<string, MusicianLevel>>,
  fallback: MusicianLevel = 'Intermédiaire',
): MusicianLevel {
  const ranks = Object.values(instrumentLevels).map((level) => levelOptions.indexOf(level));
  if (ranks.length === 0) return fallback;
  return levelOptions[Math.max(...ranks)] ?? fallback;
}

export interface OnboardingDraft {
  city: string;
  country: string;
  genres: string[];
  instrumentLevels: Record<string, MusicianLevel>;
  instruments: string[];
  level: MusicianLevel;
  name: string;
  photoUrl: string | null;
  postalCode: string;
}

export const emptyOnboardingDraft: OnboardingDraft = {
  city: '',
  country: 'CH',
  genres: [],
  instrumentLevels: {},
  instruments: [],
  level: 'Intermédiaire',
  name: '',
  photoUrl: null,
  postalCode: '',
};

export function normalizeOnboardingDraft(draft: OnboardingDraft): OnboardingDraft {
  const instruments = normalizeInstruments(draft.instruments).sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  const instrumentLevels = normalizeInstrumentLevels(draft.instrumentLevels, instruments);
  return {
    ...draft,
    city: draft.city.trim(),
    country: draft.country.trim().toUpperCase(),
    genres: [...new Set(draft.genres.map((genre) => genre.trim()).filter(Boolean))],
    instrumentLevels,
    instruments,
    level: globalLevel(
      instrumentLevels,
      isMusicianLevel(draft.level) ? draft.level : 'Intermédiaire',
    ),
    name: draft.name.trim().replace(/\s+/g, ' '),
    photoUrl: draft.photoUrl?.trim() || null,
    postalCode: draft.postalCode.trim().toUpperCase(),
  };
}

/**
 * Un profil est « onboardé » avec les quatre informations historiques (nom, instrument, ville,
 * code postal). Les étapes ajoutées ensuite (photo, styles, école, notifications, formule) sont
 * facultatives : un compte existant qui les a sautées n'est jamais renvoyé dans le parcours.
 */
export function canCompleteOnboarding(
  draft: Pick<OnboardingDraft, 'city' | 'instruments' | 'name' | 'postalCode'>,
): boolean {
  const name = draft.name.trim();
  const instruments = normalizeInstruments(draft.instruments);
  return (
    name.length >= 2 &&
    instruments.length > 0 &&
    draft.city.trim().length >= 2 &&
    draft.postalCode.trim().length >= 3
  );
}

export function hasCompletePlace(draft: Pick<OnboardingDraft, 'city' | 'postalCode'>): boolean {
  return draft.city.trim().length >= 2 && draft.postalCode.trim().length >= 3;
}

export function toggleInstrument(instruments: readonly string[], instrument: string): string[] {
  return instruments.includes(instrument)
    ? instruments.filter((value) => value !== instrument)
    : [...instruments, instrument];
}

export function toggleGenre(genres: readonly string[], genre: string): string[] {
  return toggleInstrument(genres, genre);
}

/** Bascule un instrument et garde `instrumentLevels` cohérent (niveau par défaut à l'ajout). */
export function toggleDraftInstrument(
  draft: Pick<OnboardingDraft, 'instrumentLevels' | 'instruments' | 'level'>,
  instrument: string,
): Pick<OnboardingDraft, 'instrumentLevels' | 'instruments'> {
  const instruments = toggleInstrument(draft.instruments, instrument);
  const instrumentLevels = { ...draft.instrumentLevels };
  if (instruments.includes(instrument)) {
    instrumentLevels[instrument] ??= draft.level;
  } else {
    delete instrumentLevels[instrument];
  }
  return { instrumentLevels, instruments };
}

export function setDraftInstrumentLevel(
  draft: Pick<OnboardingDraft, 'instrumentLevels'>,
  instrument: string,
  level: MusicianLevel,
): Record<string, MusicianLevel> {
  return { ...draft.instrumentLevels, [instrument]: level };
}

export const onboardingSteps = [
  'language',
  'concepts',
  'place',
  'identity',
  'instruments',
  'styles',
  'school',
  'notifications',
  'plan',
] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

export type OnboardingStepIssue =
  'instruments_required' | 'name_too_short' | 'place_incomplete' | null;

/** Ce qui manque pour quitter une étape ; `null` quand on peut continuer. */
export function onboardingStepIssue(
  step: OnboardingStep,
  draft: OnboardingDraft,
): OnboardingStepIssue {
  switch (step) {
    case 'place':
      return hasCompletePlace(draft) ? null : 'place_incomplete';
    case 'identity':
      return draft.name.trim().replace(/\s+/g, ' ').length >= 2 ? null : 'name_too_short';
    case 'instruments':
      return normalizeInstruments(draft.instruments).length > 0 ? null : 'instruments_required';
    default:
      return null;
  }
}

export function onboardingStepIssueMessage(issue: Exclude<OnboardingStepIssue, null>): string {
  switch (issue) {
    case 'instruments_required':
      return 'Choisis au moins un instrument.';
    case 'name_too_short':
      return 'Ton nom doit faire au moins deux caractères.';
    case 'place_incomplete':
      return 'Indique ton code postal pour continuer.';
  }
}

/** Première étape encore bloquante ; utile pour ne jamais reprendre un parcours après un trou. */
export function firstBlockingStepIndex(draft: OnboardingDraft): number {
  const index = onboardingSteps.findIndex((step) => onboardingStepIssue(step, draft) !== null);
  return index === -1 ? onboardingSteps.length - 1 : index;
}

/** Étape de reprise sûre : jamais au-delà de la première étape encore bloquante. */
export function resumeStepIndex(storedStep: number, draft: OnboardingDraft): number {
  const bounded = Math.min(Math.max(Math.trunc(storedStep), 0), onboardingSteps.length - 1);
  return Math.min(bounded, firstBlockingStepIndex(draft));
}

/**
 * Reprise d'un brouillon local par-dessus le profil serveur : le local complète ce que le
 * serveur ignore encore, le serveur garde ce qui a été enregistré ailleurs entre-temps.
 */
export function mergeResumedDraft(
  server: OnboardingDraft,
  stored: OnboardingDraft,
): OnboardingDraft {
  const instruments = stored.instruments.length > 0 ? stored.instruments : server.instruments;
  const instrumentLevels =
    Object.keys(stored.instrumentLevels).length > 0
      ? stored.instrumentLevels
      : server.instrumentLevels;
  return normalizeOnboardingDraft({
    city: stored.city.trim() || server.city,
    country: stored.country.trim() || server.country,
    genres: stored.genres.length > 0 ? stored.genres : server.genres,
    instrumentLevels,
    instruments,
    level: stored.level,
    name: stored.name.trim() || server.name,
    photoUrl: server.photoUrl ?? stored.photoUrl,
    postalCode: stored.postalCode.trim() || server.postalCode,
  });
}

export const onboardingConcepts = [
  {
    icon: 'flash' as const,
    text: 'Un musicien te lâche ? Publie « cherche bassiste samedi » : les musiciens dispo et compatibles répondent, tu acceptes en un tap.',
    title: 'SOS & match',
  },
  {
    icon: 'people' as const,
    text: 'Répertoire, setlists, sessions et présences : ton groupe a enfin un seul endroit pour tout, sans fil WhatsApp interminable.',
    title: 'Tes groupes',
  },
  {
    icon: 'school' as const,
    text: 'Rejoins la communauté de ton école de musique : élèves et profs se retrouvent, se dépannent et montent des projets.',
    title: 'Ton école',
  },
] as const;

export const onboardingSchoolRoles = ['student', 'teacher', 'alumni'] as const;
export type OnboardingSchoolRole = (typeof onboardingSchoolRoles)[number];

/** Place l'AMR en tête, puis l'ordre alphabétique — sans altérer la liste reçue. */
export function sortSchoolsForOnboarding<
  T extends { name: string; shortName: string | null; slug: string },
>(schools: readonly T[]): T[] {
  const isFeatured = (school: T) =>
    school.shortName?.trim().toUpperCase() === 'AMR' || /(^|-)amr(-|$)/.test(school.slug);
  return [...schools].sort((left, right) => {
    const featured = Number(isFeatured(right)) - Number(isFeatured(left));
    if (featured !== 0) return featured;
    return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
  });
}
