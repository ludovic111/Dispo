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

export const levelOptions = ['Débutant', 'Intermédiaire', 'Avancé', 'Professionnel'] as const;
export type MusicianLevel = (typeof levelOptions)[number];

export interface OnboardingDraft {
  city: string;
  country: string;
  instruments: string[];
  level: MusicianLevel;
  name: string;
  postalCode: string;
}

export const emptyOnboardingDraft: OnboardingDraft = {
  city: '',
  country: 'CH',
  instruments: [],
  level: 'Intermédiaire',
  name: '',
  postalCode: '',
};

export function normalizeOnboardingDraft(draft: OnboardingDraft): OnboardingDraft {
  return {
    ...draft,
    city: draft.city.trim(),
    country: draft.country.trim().toUpperCase(),
    instruments: [...new Set(draft.instruments)].sort((a, b) => a.localeCompare(b, 'fr')),
    name: draft.name.trim(),
    postalCode: draft.postalCode.trim().toUpperCase(),
  };
}

export function canCompleteOnboarding(draft: OnboardingDraft): boolean {
  const value = normalizeOnboardingDraft(draft);
  return (
    value.name.length >= 2 &&
    value.instruments.length > 0 &&
    value.city.length >= 2 &&
    value.postalCode.length >= 3
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
