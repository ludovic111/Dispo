import {
  Platform,
  StyleSheet,
  type ColorSchemeName,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { mix, parseColor, rgbaString } from './color';
import { defaultThemeId, themePalette, type ThemeId } from './themes';

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
 * - Fraunces pour les titres éditoriaux (écran, section, noms) et les chiffres
 *   des billets ;
 * - Spline Sans Mono pour les étiquettes gravées et les données (dates, BPM,
 *   tonalités).
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

/**
 * Palette d'un thème pour un schéma. Les 19 clés historiques restent ; les
 * clés « Backstage » (surfaces, arêtes, encres) sont additives.
 */
export interface DispoPalette {
  accent: string;
  /** Accent assombri : arête basse des boutons, extrémité des duotones. */
  accentDeep: string;
  /** Encre lisible posée sur `accent` (texte des boutons pleins, initiales). */
  accentInk: string;
  /** Surface accent douce et opaque (sélection, pastille de filtre actif). */
  accentSoft: string;
  background: string;
  border: string;
  bronze: string;
  card: string;
  cardElevated: string;
  cardMuted: string;
  concert: string;
  /** Arête sombre opaque des surfaces relevées et des rails en creux. */
  edge: string;
  electric: string;
  error: string;
  /** Liseré clair (1 pt) posé en haut d'une surface relevée. */
  highlight: string;
  /** Encre la plus profonde du thème (fond sombre / texte clair). */
  ink: string;
  inset: string;
  jazzDeep: string;
  jazzGlow: string;
  jam: string;
  muted: string;
  /** Papier le plus clair du thème (fond clair / texte sombre). */
  paper: string;
  rehearsal: string;
  /** Ombre diffuse (grande, très légère). */
  shadowAmbient: string;
  /** Ombre portée (courte, plus dense). */
  shadowKey: string;
  signal: string;
  /** Bas du dégradé vertical des cartes (≈ 3 % plus sombre que le haut). */
  surfaceBottom: string;
  /** Haut du dégradé vertical des cartes. */
  surfaceTop: string;
  text: string;
  textInverse: string;
  /** Ambre d'avertissement (VU-mètre, états intermédiaires). */
  warning: string;
}

export const lightPalette: DispoPalette = themePalette(defaultThemeId, 'light');
export const darkPalette: DispoPalette = themePalette(defaultThemeId, 'dark');

export function paletteFor(
  scheme: ColorSchemeName,
  themeId: ThemeId = defaultThemeId,
): DispoPalette {
  return themePalette(themeId, scheme === 'light' ? 'light' : 'dark');
}

/** Ombre historique des cartes (schéma seul). Préférer `elevation(level, palette)`. */
export function cardShadow(scheme: ColorSchemeName): ViewStyle {
  return elevation(1, scheme === 'light' ? lightPalette : darkPalette);
}

/** Retour visuel d'appui unique pour toute l'app. */
export const pressedStyle: ViewStyle = { opacity: 0.88, transform: [{ scale: 0.985 }] };
export const pressedStyleReducedMotion: ViewStyle = { opacity: 0.88 };
export const disabledStyle: ViewStyle = { opacity: 0.45 };

/** Encre fixe des surfaces « billet » et du dégradé hero, dans les deux thèmes. */
export const billetInk = '#050814';
/** Blanc fixe posé sur les dégradés et fonds signal. */
export const onAccent = '#FFFFFF';

/**
 * Teinte translucide d'une couleur : `tint(palette.electric, 0.16)`.
 * Accepte hex (3/4/6/8), `rgb()`, `rgba()`, `hsl()`, `hsla()`. Une entrée
 * illisible (`transparent`, `undefined` sous test) revient inchangée.
 */
export function tint(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return rgbaString({ ...parsed, a: Math.min(1, Math.max(0, alpha)) });
}

/**
 * Mélange tolérant : `blend(a, b, 0.3)` rapproche `a` de `b` ; si l'une des
 * deux couleurs est illisible (palette partielle sous test), `a` est renvoyée.
 */
export function blend(colorA: string, colorB: string, amount: number): string {
  return parseColor(colorA) && parseColor(colorB) ? mix(colorA, colorB, amount) : colorA;
}

/** Dégradés dérivés d'une palette. Un seul vrai dégradé décoratif : `premium`. */
export function gradientsFor(palette: DispoPalette) {
  return {
    hero: [palette.accent, palette.accentDeep] as const,
    jazzNight: [palette.jazzDeep, palette.accentDeep] as const,
    series: [palette.bronze, palette.muted] as const,
    alert: [palette.signal, palette.error] as const,
    premium: [palette.accent, palette.accentDeep, palette.ink] as const,
    /** Haut → bas d'une surface relevée. */
    surface: [palette.surfaceTop, palette.surfaceBottom] as const,
    /** Duotone accent pour les avatars sans photo. */
    duotone: [palette.accentDeep, palette.accent] as const,
  };
}

/** Dégradés du thème par défaut (imports historiques). */
export const gradients = {
  hero: ['#00D2FF', '#0099FF'] as const,
  jazzNight: ['#123B74', '#0099FF'] as const,
  series: ['#CBD5E1', '#8E9AAF'] as const,
  alert: ['#EF9D7B', '#E0734F'] as const,
  premium: ['#00D2FF', '#0099FF', '#050814'] as const,
};

/** Voile posé derrière les feuilles ; dérivé de l'encre du thème. */
export function scrimFor(palette: DispoPalette): string {
  return tint(palette.ink, 0.6);
}

export type ElevationLevel = 0 | 1 | 2 | 3;

const elevationCache = new WeakMap<DispoPalette, Map<ElevationLevel, ViewStyle>>();

const elevationSpecs: Record<
  ElevationLevel,
  { darkOpacity: number; elevation: number; height: number; lightOpacity: number; radius: number }
> = {
  0: { darkOpacity: 0, elevation: 0, height: 0, lightOpacity: 0, radius: 0 },
  1: { darkOpacity: 0.32, elevation: 2, height: 3, lightOpacity: 0.1, radius: 6 },
  2: { darkOpacity: 0.4, elevation: 4, height: 6, lightOpacity: 0.14, radius: 12 },
  3: { darkOpacity: 0.48, elevation: 6, height: 8, lightOpacity: 0.2, radius: 16 },
};

/**
 * Ombre d'une surface relevée : ombre portée courte (`shadowKey`) sur iOS,
 * `elevation` sur Android. Niveau 0 = aucune, 1 = carte, 2 = surface
 * flottante (barre d'onglets, feuille), 3 = billet mis en avant.
 */
export function elevation(level: ElevationLevel, palette: DispoPalette): ViewStyle {
  let byLevel = elevationCache.get(palette);
  if (!byLevel) {
    byLevel = new Map();
    elevationCache.set(palette, byLevel);
  }
  const cached = byLevel.get(level);
  if (cached) return cached;
  const dark = palette.ink === palette.background;
  const spec = elevationSpecs[level];
  const style: ViewStyle =
    level === 0
      ? {}
      : {
          shadowColor: palette.shadowKey,
          shadowOpacity: dark ? spec.darkOpacity : spec.lightOpacity,
          shadowRadius: spec.radius,
          shadowOffset: { width: 0, height: spec.height },
          elevation: spec.elevation,
        };
  byLevel.set(level, style);
  return style;
}

/** Ombre diffuse à poser sur un conteneur autour d'une surface de niveau ≥ 2. */
export function ambientShadow(palette: DispoPalette): ViewStyle {
  const dark = palette.ink === palette.background;
  return {
    shadowColor: palette.shadowAmbient,
    shadowOpacity: dark ? 0.35 : 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  };
}

export type SurfaceTone = 'default' | 'elevated' | 'inset' | 'muted';

interface SurfaceStyles {
  /** Couleur de repli quand la surface n'utilise pas de dégradé. */
  backgroundColor: string;
  /** Conteneur : rayon, bordure, ombre. */
  container: ViewStyle;
  /** Dégradé haut → bas (null pour les surfaces en creux). */
  gradient: readonly [string, string] | null;
  /** Liseré clair de 1 pt posé en haut de la surface (null en creux). */
  highlight: ViewStyle | null;
}

const surfaceCache = new WeakMap<DispoPalette, Map<SurfaceTone, SurfaceStyles>>();

/**
 * Surface « Backstage » : dégradé vertical subtil, liseré haut clair, arête
 * légèrement plus sombre que la surface et ombre portée. Les primitives la
 * consomment ; aucun écran ne la reconstruit.
 */
export function surfaceStyle(palette: DispoPalette, tone: SurfaceTone = 'default'): SurfaceStyles {
  let byTone = surfaceCache.get(palette);
  if (!byTone) {
    byTone = new Map();
    surfaceCache.set(palette, byTone);
  }
  const cached = byTone.get(tone);
  if (cached) return cached;
  let styles: SurfaceStyles;
  if (tone === 'inset') {
    styles = {
      backgroundColor: palette.inset,
      container: insetStyle(palette),
      gradient: null,
      highlight: null,
    };
  } else if (tone === 'muted') {
    styles = {
      backgroundColor: palette.cardMuted,
      container: {
        backgroundColor: palette.cardMuted,
        borderColor: palette.border,
        borderWidth: StyleSheet.hairlineWidth,
      },
      gradient: null,
      highlight: null,
    };
  } else {
    const base = tone === 'elevated' ? palette.cardElevated : palette.card;
    styles = {
      backgroundColor: base,
      container: {
        backgroundColor: base,
        borderColor: palette.edge,
        borderWidth: StyleSheet.hairlineWidth,
        ...elevation(tone === 'elevated' ? 2 : 1, palette),
      },
      gradient:
        tone === 'elevated'
          ? [palette.surfaceTop, palette.cardElevated]
          : [palette.surfaceTop, palette.surfaceBottom],
      highlight: {
        backgroundColor: palette.highlight,
        height: 1,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
      },
    };
  }
  byTone.set(tone, styles);
  return styles;
}

const insetCache = new WeakMap<DispoPalette, ViewStyle>();

/**
 * Surface en creux (rail segmenté, champ, poignée de feuille) : remplissage
 * plus sombre, liseré haut sombre et liseré bas clair qui simulent une ombre
 * intérieure.
 */
export function insetStyle(palette: DispoPalette): ViewStyle {
  const cached = insetCache.get(palette);
  if (cached) return cached;
  const style: ViewStyle = {
    backgroundColor: palette.inset,
    borderBottomColor: palette.highlight,
    borderColor: palette.edge,
    borderTopColor: tint(palette.shadowKey, palette.ink === palette.background ? 0.55 : 0.18),
    borderWidth: 1,
  };
  insetCache.set(palette, style);
  return style;
}

/** Même surface en creux, typée pour un `TextInput` (champ, composeur). */
export function insetInputStyle(palette: DispoPalette): TextStyle {
  return insetStyle(palette) as TextStyle;
}

/** Épaisseur de l'arête basse des touches (boutons pleins, touche segmentée). */
export const keyEdgeWidth = 2;
/** Liseré clair posé en haut d'une touche accent, dans les deux schémas. */
export const keyHighlight = 'rgba(255, 255, 255, 0.32)';

/**
 * Touche relevée : remplissage plein, arête basse plus sombre de 2 pt qui
 * disparaît à l'appui (`pressedKeyStyle`) pendant que la touche descend de 1 pt.
 */
export function keyStyle(fill: string, edge: string): ViewStyle {
  return {
    backgroundColor: fill,
    borderBottomColor: edge,
    borderBottomWidth: keyEdgeWidth,
  };
}

export const pressedKeyStyle: ViewStyle = {
  borderBottomColor: 'transparent',
  transform: [{ translateY: 1 }],
};
export const pressedKeyStyleReducedMotion: ViewStyle = { borderBottomColor: 'transparent' };

/**
 * Étiquette « gravée » (`AppText variant="label"`) : ombre de 1 pt claire sous
 * le texte sur fond clair, sombre sur fond sombre. Aucun flou au-delà de 1.
 */
export function engravedLabelStyle(dark: boolean): TextStyle {
  return dark
    ? {
        textShadowColor: 'rgba(0, 0, 0, 0.4)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
      }
    : {
        textShadowColor: 'rgba(255, 255, 255, 0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
      };
}
