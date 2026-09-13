import { Platform, type ColorSchemeName, type TextStyle, type ViewStyle } from 'react-native';

/** Taille tactile native minimale : 44 pt sur iOS, 48 dp sur Android. */
export const minimumTouchTarget = Platform.OS === 'android' ? 48 : 44;

/**
 * Grille d'espacement sur base 4. Utiliser ces clés partout : jamais de
 * nombre brut dans `padding`, `gap` ou `margin`.
 */
export const spacing = {
  xxs: 4,
  tight: 6,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  /** Marge horizontale d'un écran. */
  gutter: 20,
  /* Alias hérités, alignés sur la grille — à remplacer par les clés ci-dessus. */
  hairline: 2,
  xxxs: 4,
  compact: 4,
  chip: 8,
  control: 12,
  section: 12,
  cluster: 12,
} as const;

/** Rayons : une seule échelle, des petits contrôles aux cartes. */
export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  round: 999,
  /* Alias sémantiques */
  chip: 999,
  input: 12,
  button: 14,
  control: 16,
  ticket: 18,
  promo: 20,
  card: 20,
  feature: 24,
} as const;

/**
 * Trois familles, un rôle chacune :
 * - système (SF / Roboto) pour tout le texte courant et les contrôles ;
 * - Fraunces pour les titres éditoriaux (écran, section, noms) ;
 * - Spline Sans Mono pour les étiquettes et données (dates, BPM, tonalités).
 */
export const typography = {
  body: Platform.select({ android: 'sans-serif', default: 'sans-serif', ios: 'System' }),
  display: 'FrauncesDisplay',
  displayItalic: 'FrauncesDisplayItalic',
  mono: 'SplineSansMonoMedium',
  monoSemibold: 'SplineSansMonoSemibold',
} as const;

/** Graisses autorisées. Rien au-dessus de 700 : la marque reste calme. */
export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

export interface DispoPalette {
  accent: string;
  background: string;
  border: string;
  bronze: string;
  card: string;
  cardElevated: string;
  cardMuted: string;
  concert: string;
  electric: string;
  error: string;
  inset: string;
  jazzDeep: string;
  jazzGlow: string;
  jam: string;
  muted: string;
  rehearsal: string;
  signal: string;
  text: string;
  textInverse: string;
}

export const lightPalette: DispoPalette = {
  accent: '#0099FF',
  background: '#F0F4FF',
  border: 'rgba(42, 58, 102, 0.16)',
  bronze: '#475569',
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',
  cardMuted: '#E6EEFF',
  concert: '#0573D1',
  electric: '#0077D6',
  error: '#B8401A',
  inset: '#E2E8F0',
  jazzDeep: '#123B74',
  jazzGlow: '#B9E8FF',
  jam: '#05856E',
  muted: '#5B6B85',
  rehearsal: '#614FB8',
  signal: '#B8401A',
  text: '#050814',
  textInverse: '#FFFFFF',
};

export const darkPalette: DispoPalette = {
  accent: '#00D2FF',
  background: '#050814',
  border: 'rgba(120, 150, 210, 0.22)',
  bronze: '#8E9AAF',
  card: '#0A1128',
  cardElevated: '#0D1634',
  cardMuted: '#0E1835',
  concert: '#2EB8FF',
  electric: '#00D2FF',
  error: '#EE6A3C',
  inset: '#111C3D',
  jazzDeep: '#123B74',
  jazzGlow: '#2BBFFF',
  jam: '#38C7A6',
  muted: '#93A0B8',
  rehearsal: '#A391F5',
  signal: '#EE6A3C',
  text: '#F8FAFC',
  textInverse: '#050814',
};

export function paletteFor(scheme: ColorSchemeName): DispoPalette {
  return scheme === 'light' ? lightPalette : darkPalette;
}

export function cardShadow(scheme: ColorSchemeName): ViewStyle {
  return scheme === 'light'
    ? {
        shadowColor: '#2A3A66',
        shadowOpacity: 0.1,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }
    : {
        shadowColor: '#000000',
        shadowOpacity: 0.28,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 1,
      };
}

/** Retour visuel d'appui unique pour toute l'app. */
export const pressedStyle: ViewStyle = { opacity: 0.88, transform: [{ scale: 0.985 }] };
export const pressedStyleReducedMotion: ViewStyle = { opacity: 0.88 };
export const disabledStyle: ViewStyle = { opacity: 0.45 };

export const gradients = {
  hero: ['#00D2FF', '#0099FF'] as const,
  jazzNight: ['#123B74', '#0099FF'] as const,
  series: ['#CBD5E1', '#8E9AAF'] as const,
  alert: ['#EF9D7B', '#E0734F'] as const,
  premium: ['#00D2FF', '#0099FF', '#050814'] as const,
};

/** Encre fixe des surfaces « billet » et du dégradé hero, dans les deux thèmes. */
export const billetInk = '#050814';
/** Blanc fixe posé sur les dégradés et fonds signal. */
export const onAccent = '#FFFFFF';

/** Teinte translucide d'une couleur (hex 6 chiffres) : `tint(palette.electric, 0.16)`. */
export function tint(hex: string, alpha: number): string {
  const clamped = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${clamped.toString(16).padStart(2, '0').toUpperCase()}`;
}
