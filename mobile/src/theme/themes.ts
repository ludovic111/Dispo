import {
  contrastRatio,
  darken,
  ensureContrast,
  hsl,
  lighten,
  mix,
  readableOn,
  withAlpha,
} from './color';
import type { DispoPalette } from './tokens';

/**
 * Registre des thèmes de couleur. Chaque thème fournit une palette claire et
 * une palette sombre complètes (`DispoPalette`), dérivées d'une graine HSL par
 * `derivePalette`, sauf « Jazz » dont les valeurs historiques sont gardées
 * telles quelles comme base de la marque.
 *
 * Les couleurs métier (concert, répétition, jam, signal, erreur, avertissement)
 * sont identiques dans tous les thèmes : un SOS reste orange partout.
 */
export type ThemeId =
  | 'jazz'
  | 'minuit'
  | 'ocean'
  | 'lagon'
  | 'emeraude'
  | 'foret'
  | 'ambre'
  | 'cuivre'
  | 'corail'
  | 'rose'
  | 'violet'
  | 'prune'
  | 'graphite'
  | 'sable'
  | 'bordeaux';

export interface DispoTheme {
  dark: DispoPalette;
  id: ThemeId;
  light: DispoPalette;
  /** Nom affiché : clé i18n (valeur française). */
  name: string;
}

export const defaultThemeId: ThemeId = 'jazz';

/** Les 19 clés historiques ; les clés « Backstage » sont dérivées ensuite. */
type BasePalette = Pick<
  DispoPalette,
  | 'accent'
  | 'background'
  | 'border'
  | 'bronze'
  | 'card'
  | 'cardElevated'
  | 'cardMuted'
  | 'concert'
  | 'electric'
  | 'error'
  | 'inset'
  | 'jazzDeep'
  | 'jazzGlow'
  | 'jam'
  | 'muted'
  | 'rehearsal'
  | 'signal'
  | 'text'
  | 'textInverse'
>;

/** Couleurs métier partagées par tous les thèmes. */
const metier = {
  dark: {
    concert: '#2EB8FF',
    error: '#EE6A3C',
    jam: '#38C7A6',
    rehearsal: '#A391F5',
    signal: '#EE6A3C',
    warning: '#F2B33D',
  },
  light: {
    concert: '#0573D1',
    error: '#B8401A',
    jam: '#05856E',
    rehearsal: '#614FB8',
    signal: '#B8401A',
    warning: '#9A6410',
  },
} as const;

const jazzLight: BasePalette = {
  accent: '#0088F0',
  background: '#F0F4FF',
  border: 'rgba(42, 58, 102, 0.16)',
  bronze: '#475569',
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',
  cardMuted: '#E6EEFF',
  concert: metier.light.concert,
  electric: '#0077D6',
  error: metier.light.error,
  inset: '#E2E8F0',
  jazzDeep: '#123B74',
  jazzGlow: '#B9E8FF',
  jam: metier.light.jam,
  muted: '#5B6B85',
  rehearsal: metier.light.rehearsal,
  signal: metier.light.signal,
  text: '#050814',
  textInverse: '#FFFFFF',
};

const jazzDark: BasePalette = {
  accent: '#00D2FF',
  background: '#050814',
  border: 'rgba(120, 150, 210, 0.22)',
  bronze: '#8E9AAF',
  card: '#0A1128',
  cardElevated: '#0D1634',
  cardMuted: '#0E1835',
  concert: metier.dark.concert,
  electric: '#00D2FF',
  error: metier.dark.error,
  inset: '#111C3D',
  jazzDeep: '#123B74',
  jazzGlow: '#2BBFFF',
  jam: metier.dark.jam,
  muted: '#93A0B8',
  rehearsal: metier.dark.rehearsal,
  signal: metier.dark.signal,
  text: '#F8FAFC',
  textInverse: '#050814',
};

interface ThemeSeed {
  accentDark: string;
  accentLight: string;
  /** Saturation des surfaces (0–100). Faible pour les thèmes neutres. */
  chroma: number;
  /** Teinte HSL des fonds, cartes et textes. */
  hue: number;
  id: ThemeId;
  name: string;
  /** Papier clair teinté (défaut : blanc). */
  paperCard?: string;
}

const seeds: readonly ThemeSeed[] = [
  {
    id: 'jazz',
    name: 'Jazz',
    hue: 226,
    chroma: 60,
    accentLight: jazzLight.accent,
    accentDark: jazzDark.accent,
  },
  {
    id: 'minuit',
    name: 'Minuit',
    hue: 240,
    chroma: 46,
    accentLight: '#4B55D2',
    accentDark: '#8B93FF',
  },
  {
    id: 'ocean',
    name: 'Océan',
    hue: 202,
    chroma: 58,
    accentLight: '#0A72B5',
    accentDark: '#22D3EE',
  },
  {
    id: 'lagon',
    name: 'Lagon',
    hue: 182,
    chroma: 40,
    accentLight: '#0B7D76',
    accentDark: '#2DD4BF',
  },
  {
    id: 'emeraude',
    name: 'Émeraude',
    hue: 156,
    chroma: 34,
    accentLight: '#0E8756',
    accentDark: '#34D399',
  },
  {
    id: 'foret',
    name: 'Forêt',
    hue: 140,
    chroma: 22,
    accentLight: '#2F7A3E',
    accentDark: '#5FD48A',
  },
  {
    id: 'ambre',
    name: 'Ambre',
    hue: 38,
    chroma: 30,
    accentLight: '#9C600F',
    accentDark: '#F5B532',
  },
  {
    id: 'cuivre',
    name: 'Cuivre',
    hue: 22,
    chroma: 34,
    accentLight: '#BD3F0E',
    accentDark: '#FB923C',
  },
  {
    id: 'corail',
    name: 'Corail',
    hue: 8,
    chroma: 30,
    accentLight: '#C93F3F',
    accentDark: '#FF8A7A',
  },
  { id: 'rose', name: 'Rose', hue: 332, chroma: 34, accentLight: '#B92470', accentDark: '#F472B6' },
  {
    id: 'violet',
    name: 'Violet',
    hue: 268,
    chroma: 40,
    accentLight: '#7038DC',
    accentDark: '#B794F6',
  },
  {
    id: 'prune',
    name: 'Prune',
    hue: 302,
    chroma: 24,
    accentLight: '#88377A',
    accentDark: '#D98CD0',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    hue: 220,
    chroma: 8,
    accentLight: '#2457D6',
    accentDark: '#60A5FA',
  },
  {
    id: 'sable',
    name: 'Sable',
    hue: 38,
    chroma: 40,
    accentLight: '#85562A',
    accentDark: '#E3B57E',
    paperCard: '#FFFCF6',
  },
  {
    id: 'bordeaux',
    name: 'Bordeaux',
    hue: 350,
    chroma: 30,
    accentLight: '#8B1E3F',
    accentDark: '#F27A9B',
  },
];

function deriveBase(seed: ThemeSeed, scheme: 'light' | 'dark'): BasePalette {
  const { chroma, hue } = seed;
  if (scheme === 'dark') {
    const background = hsl(hue, chroma + 6, 5.5);
    const card = hsl(hue, chroma, 10);
    const cardElevated = hsl(hue, chroma, 13);
    const accent = seed.accentDark;
    return {
      accent,
      background,
      border: withAlpha(hsl(hue, 50, 65), 0.22),
      bronze: hsl(hue, 16, 62),
      card,
      cardElevated,
      cardMuted: hsl(hue, chroma - 2, 13),
      concert: metier.dark.concert,
      electric: ensureContrast(accent, cardElevated, 4.5),
      error: metier.dark.error,
      inset: hsl(hue, chroma - 4, 15),
      jazzDeep: mix(darken(accent, 26), background, 0.25),
      jazzGlow: mix(accent, '#FFFFFF', 0.12),
      jam: metier.dark.jam,
      muted: ensureContrast(hsl(hue, 20, 66), cardElevated, 4.5),
      rehearsal: metier.dark.rehearsal,
      signal: metier.dark.signal,
      text: hsl(hue, 30, 98),
      textInverse: background,
    };
  }
  const background = hsl(hue, Math.min(100, chroma + 40), 97);
  const card = seed.paperCard ?? '#FFFFFF';
  const cardMuted = hsl(hue, Math.min(100, chroma + 40), 95);
  const accent = seed.accentLight;
  return {
    accent,
    background,
    border: withAlpha(hsl(hue, 42, 28), 0.16),
    bronze: ensureContrast(hsl(hue, 19, 35), cardMuted, 4.5),
    card,
    cardElevated: card,
    cardMuted,
    concert: metier.light.concert,
    electric: ensureContrast(darken(accent, 4), cardMuted, 4.5),
    error: metier.light.error,
    inset: hsl(hue, 33, 91),
    jazzDeep: mix(darken(accent, 18), hsl(hue, 60, 26), 0.4),
    jazzGlow: mix(accent, '#FFFFFF', 0.72),
    jam: metier.light.jam,
    muted: ensureContrast(hsl(hue, 19, 44), cardMuted, 4.5),
    rehearsal: metier.light.rehearsal,
    signal: metier.light.signal,
    text: hsl(hue, 60, 5),
    textInverse: '#FFFFFF',
  };
}

/** Ajoute les clés « Backstage » (surfaces, arêtes, encres) à une palette de base. */
export function extendPalette(base: BasePalette, scheme: 'light' | 'dark'): DispoPalette {
  const dark = scheme === 'dark';
  const ink = dark ? base.background : base.text;
  const paper = dark ? base.text : base.background;
  const accentInk = readableOn(base.accent, [ink, '#FFFFFF', paper]);
  const surfaceTop = dark ? lighten(base.card, 2.5) : base.card;
  const surfaceBottom = dark ? darken(base.card, 1) : mix(base.card, base.background, 0.55);
  return {
    ...base,
    accentDeep: darken(base.accent, dark ? 16 : 12),
    accentInk,
    accentSoft: mix(base.accent, base.card, dark ? 0.8 : 0.84),
    edge: dark ? mix(base.card, '#000000', 0.5) : mix(base.card, base.text, 0.13),
    highlight: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.35)',
    ink,
    paper,
    shadowAmbient: dark ? '#000000' : mix(base.text, base.jazzDeep, 0.6),
    shadowKey: dark ? '#000000' : mix(base.text, base.jazzDeep, 0.5),
    surfaceBottom,
    surfaceTop,
    warning: dark ? metier.dark.warning : metier.light.warning,
  };
}

function buildTheme(seed: ThemeSeed): DispoTheme {
  const light = seed.id === 'jazz' ? jazzLight : deriveBase(seed, 'light');
  const dark = seed.id === 'jazz' ? jazzDark : deriveBase(seed, 'dark');
  return {
    dark: extendPalette(dark, 'dark'),
    id: seed.id,
    light: extendPalette(light, 'light'),
    name: seed.name,
  };
}

export const themes: readonly DispoTheme[] = seeds.map(buildTheme);

const themeIndex = new Map<ThemeId, DispoTheme>(themes.map((theme) => [theme.id, theme]));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themeIndex.has(value as ThemeId);
}

export function themeById(id: ThemeId | string | null | undefined): DispoTheme {
  return (
    (isThemeId(id) ? themeIndex.get(id) : undefined) ??
    (themeIndex.get(defaultThemeId) as DispoTheme)
  );
}

/** Palette d'un thème pour un schéma donné. */
export function themePalette(
  id: ThemeId | string | null | undefined,
  scheme: 'light' | 'dark',
): DispoPalette {
  const theme = themeById(id);
  return scheme === 'light' ? theme.light : theme.dark;
}

/** Réexport pratique pour les tests et le sélecteur de thème. */
export { contrastRatio };
