import type { ColorSchemeName, ViewStyle } from 'react-native';

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  chip: 10,
  button: 14,
  ticket: 18,
  card: 22,
  round: 999,
} as const;

export const typography = {
  display: 'FrauncesDisplay',
  displayItalic: 'FrauncesDisplayItalic',
  mono: 'SplineSansMonoMedium',
  monoSemibold: 'SplineSansMonoSemibold',
  body: undefined,
} as const;

export interface DispoPalette {
  accent: string;
  background: string;
  border: string;
  bronze: string;
  card: string;
  concert: string;
  electric: string;
  error: string;
  inset: string;
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
  border: 'rgba(42, 58, 102, 0.18)',
  bronze: '#475569',
  card: '#FFFFFF',
  concert: '#0573D1',
  electric: '#0099FF',
  error: '#B8401A',
  inset: '#E2E8F0',
  jam: '#05856E',
  muted: '#64748B',
  rehearsal: '#614FB8',
  signal: '#B8401A',
  text: '#050814',
  textInverse: '#FFFFFF',
};

export const darkPalette: DispoPalette = {
  accent: '#00D2FF',
  background: '#050814',
  border: 'rgba(42, 58, 102, 0.72)',
  bronze: '#8E9AAF',
  card: '#0A1128',
  concert: '#2EB8FF',
  electric: '#00D2FF',
  error: '#EE6A3C',
  inset: '#0E1835',
  jam: '#38C7A6',
  muted: '#8E9AAF',
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
        shadowOpacity: 0.14,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 3,
      }
    : {
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
      };
}

export const gradients = {
  hero: ['#00D2FF', '#0099FF'] as const,
  series: ['#CBD5E1', '#8E9AAF'] as const,
  alert: ['#EF9D7B', '#E0734F'] as const,
  premium: ['#00D2FF', '#0099FF', '#050814'] as const,
};

/** Encre fixe des surfaces « billet » et du dégradé hero, dans les deux thèmes. */
export const billetInk = '#050814';
