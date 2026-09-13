import { describe, expect, it } from '@jest/globals';

import { contrastRatio, mix, parseColor, readableOn } from '@/theme/color';
import { defaultThemeId, themeById, themes } from '@/theme/themes';
import {
  darkPalette,
  gradients,
  gradientsFor,
  lightPalette,
  paletteFor,
  surfaceStyle,
  tint,
  type DispoPalette,
} from '@/theme/tokens';

const schemes = ['light', 'dark'] as const;

const legacyKeys: readonly (keyof DispoPalette)[] = [
  'accent',
  'background',
  'border',
  'bronze',
  'card',
  'cardElevated',
  'cardMuted',
  'concert',
  'electric',
  'error',
  'inset',
  'jazzDeep',
  'jazzGlow',
  'jam',
  'muted',
  'rehearsal',
  'signal',
  'text',
  'textInverse',
];

const backstageKeys: readonly (keyof DispoPalette)[] = [
  'accentDeep',
  'accentInk',
  'accentSoft',
  'edge',
  'highlight',
  'ink',
  'paper',
  'shadowAmbient',
  'shadowKey',
  'surfaceBottom',
  'surfaceTop',
  'warning',
];

describe('theme palettes', () => {
  it('registers fifteen named themes with Jazz first as the default', () => {
    expect(themes.map((theme) => theme.id)).toEqual([
      'jazz',
      'minuit',
      'ocean',
      'lagon',
      'emeraude',
      'foret',
      'ambre',
      'cuivre',
      'corail',
      'rose',
      'violet',
      'prune',
      'graphite',
      'sable',
      'bordeaux',
    ]);
    expect(defaultThemeId).toBe('jazz');
    expect(themeById('unknown').id).toBe('jazz');
  });

  it('keeps the historical Jazz palettes as the default exports', () => {
    expect(paletteFor('light')).toBe(lightPalette);
    expect(paletteFor('dark')).toBe(darkPalette);
    expect(paletteFor('dark', 'jazz')).toBe(darkPalette);
    expect(darkPalette.accent).toBe('#00D2FF');
    expect(darkPalette.background).toBe('#050814');
    expect(lightPalette.background).toBe('#F0F4FF');
    expect(lightPalette.electric).toBe('#0077D6');
    expect(gradients.hero).toEqual(['#00D2FF', '#0099FF']);
  });

  it.each(themes.flatMap((theme) => schemes.map((scheme) => [theme.id, scheme] as const)))(
    '%s / %s provides every palette key as a parseable colour',
    (id, scheme) => {
      const palette = paletteFor(scheme, id);
      for (const key of [...legacyKeys, ...backstageKeys]) {
        expect(parseColor(palette[key])).not.toBeNull();
      }
      expect(Object.keys(palette).sort()).toEqual([...legacyKeys, ...backstageKeys].sort());
    },
  );

  it.each(themes.flatMap((theme) => schemes.map((scheme) => [theme.id, scheme] as const)))(
    '%s / %s meets WCAG contrast for text, muted text and accents',
    (id, scheme) => {
      const palette = paletteFor(scheme, id);
      const surfaces = [palette.background, palette.card, palette.cardElevated, palette.cardMuted];
      for (const surface of surfaces) {
        expect(contrastRatio(palette.text, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.muted, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.electric, surface)).toBeGreaterThanOrEqual(3);
      }
      expect(contrastRatio(palette.text, palette.inset)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.accent, palette.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.accentInk, palette.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.signal, palette.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.error, palette.card)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.electric, palette.accentSoft)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(themes.flatMap((theme) => schemes.map((scheme) => [theme.id, scheme] as const)))(
    '%s / %s keeps the SOS signal red-orange and the metier colours shared',
    (id, scheme) => {
      const palette = paletteFor(scheme, id);
      const reference = paletteFor(scheme, 'jazz');
      expect(palette.signal).toBe(reference.signal);
      expect(palette.error).toBe(reference.error);
      expect(palette.concert).toBe(reference.concert);
      expect(palette.rehearsal).toBe(reference.rehearsal);
      expect(palette.jam).toBe(reference.jam);
      expect(palette.warning).toBe(reference.warning);
      const { r, g, b } = parseColor(palette.signal) ?? { r: 0, g: 0, b: 0 };
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    },
  );

  it.each(themes.flatMap((theme) => schemes.map((scheme) => [theme.id, scheme] as const)))(
    '%s / %s orders its surface gradient from a lighter top to a darker bottom',
    (id, scheme) => {
      const palette = paletteFor(scheme, id);
      expect(contrastRatio('#FFFFFF', palette.surfaceTop)).toBeLessThanOrEqual(
        contrastRatio('#FFFFFF', palette.surfaceBottom),
      );
      const surface = surfaceStyle(palette);
      expect(surface.gradient).toEqual([palette.surfaceTop, palette.surfaceBottom]);
      expect(surfaceStyle(palette)).toBe(surface);
      expect(surfaceStyle(palette, 'inset').gradient).toBeNull();
      expect(gradientsFor(palette).hero).toEqual([palette.accent, palette.accentDeep]);
    },
  );
});

describe('colour utilities', () => {
  it('tints hex, rgba and hsl inputs and leaves unknown values untouched', () => {
    expect(tint('#00D2FF', 0.5)).toBe('rgba(0, 210, 255, 0.5)');
    expect(tint('#0DF', 1)).toBe('rgba(0, 221, 255, 1)');
    expect(tint('rgba(42, 58, 102, 0.16)', 0.3)).toBe('rgba(42, 58, 102, 0.3)');
    expect(tint('hsl(191, 100%, 50%)', 0.2)).toBe('rgba(0, 208, 255, 0.2)');
    expect(tint('transparent', 0.2)).toBe('transparent');
  });

  it('computes WCAG ratios and picks the readable ink', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(readableOn('#FFFFFF', ['#000000', '#FFFFFF'])).toBe('#000000');
    expect(readableOn('#050814', ['#050814', '#F8FAFC'])).toBe('#F8FAFC');
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});
