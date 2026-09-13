/**
 * Utilitaires couleur purs (sans React Native) : analyse, conversions HSL,
 * mélanges et contraste WCAG. Ils servent à dériver les palettes des thèmes
 * (`themes.ts`), aux teintes translucides (`tint`) et aux tests d'accessibilité.
 */

export interface Rgba {
  a: number;
  b: number;
  g: number;
  r: number;
}

export interface Hsl {
  /** Teinte 0–360. */
  h: number;
  /** Luminosité 0–100. */
  l: number;
  /** Saturation 0–100. */
  s: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

function channelHex(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Analyse `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`, `rgba()`, `hsl()`
 * et `hsla()`. Retourne `null` pour toute autre entrée (y compris `transparent`).
 */
export function parseColor(input: string | null | undefined): Rgba | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/i.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split('').map((digit) => parseInt(digit + digit, 16));
      return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: a === undefined ? 1 : a / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }
  const functional = /^(rgba?|hsla?)\(\s*([^)]+)\)$/i.exec(value);
  if (!functional) return null;
  const kind = (functional[1] ?? '').toLowerCase();
  const parts = (functional[2] ?? '')
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  const numbers = parts.map((part) => {
    const percent = part.endsWith('%');
    const parsed = parseFloat(part);
    return { percent, value: parsed };
  });
  if (numbers.some((item) => Number.isNaN(item.value))) return null;
  const alphaPart = numbers[3];
  const a = alphaPart ? clamp01(alphaPart.percent ? alphaPart.value / 100 : alphaPart.value) : 1;
  const [first, second, third] = numbers;
  if (!first || !second || !third) return null;
  if (kind.startsWith('rgb')) {
    const channel = (item: { percent: boolean; value: number }) =>
      clamp(item.percent ? (item.value / 100) * 255 : item.value, 0, 255);
    return { r: channel(first), g: channel(second), b: channel(third), a };
  }
  const rgb = hslToRgb({
    h: first.value,
    s: clamp(second.value, 0, 100),
    l: clamp(third.value, 0, 100),
  });
  return { ...rgb, a };
}

export function rgbToHex({ r, g, b }: { b: number; g: number; r: number }): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

/** `rgba(r, g, b, a)` normalisé, tel que React Native l'accepte. */
export function rgbaString({ a, b, g, r }: Rgba): string {
  const alpha = Math.round(clamp01(a) * 1000) / 1000;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

export function hslToRgb({ h, l, s }: Hsl): { b: number; g: number; r: number } {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = clamp01(s / 100);
  const light = clamp01(l / 100);
  if (sat === 0) {
    const grey = light * 255;
    return { r: grey, g: grey, b: grey };
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: channel(hue + 1 / 3) * 255,
    g: channel(hue) * 255,
    b: channel(hue - 1 / 3) * 255,
  };
}

export function rgbToHsl({ b, g, r }: { b: number; g: number; r: number }): Hsl {
  const red = clamp01(r / 255);
  const green = clamp01(g / 255);
  const blue = clamp01(b / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: light * 100 };
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: hue * 60, s: sat * 100, l: light * 100 };
}

/** `hsl(h, s%, l%)` → `#RRGGBB`. */
export function hsl(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb({ h, s, l }));
}

export function hexToHsl(color: string): Hsl {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`Couleur illisible : ${color}`);
  return rgbToHsl(parsed);
}

/** Couleur opaque équivalente (alpha ignoré) en `#RRGGBB`. */
export function toHex(color: string): string {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`Couleur illisible : ${color}`);
  return rgbToHex(parsed);
}

/** Mélange linéaire en RGB : `mix(a, b, 0)` = a, `mix(a, b, 1)` = b. */
export function mix(colorA: string, colorB: string, amount: number): string {
  const a = parseColor(colorA);
  const b = parseColor(colorB);
  if (!a || !b) throw new Error(`Couleur illisible : ${colorA} / ${colorB}`);
  const t = clamp01(amount);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/** Éclaircit de `amount` points de luminosité HSL (0–100). */
export function lighten(color: string, amount: number): string {
  const { h, l, s } = hexToHsl(color);
  return hsl(h, s, clamp(l + amount, 0, 100));
}

/** Assombrit de `amount` points de luminosité HSL (0–100). */
export function darken(color: string, amount: number): string {
  return lighten(color, -amount);
}

/** Sature (ou désature, valeur négative) de `amount` points HSL (0–100). */
export function saturate(color: string, amount: number): string {
  const { h, l, s } = hexToHsl(color);
  return hsl(h, clamp(s + amount, 0, 100), l);
}

/** Même couleur avec l'alpha donné, sous forme `rgba()`. Tolère hex / rgb / hsl. */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return rgbaString({ ...parsed, a: alpha });
}

function linearChannel(value: number): number {
  const c = clamp01(value / 255);
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminance relative WCAG 2.x (0 = noir, 1 = blanc). Alpha ignoré. */
export function relativeLuminance(color: string): number {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`Couleur illisible : ${color}`);
  return (
    0.2126 * linearChannel(parsed.r) +
    0.7152 * linearChannel(parsed.g) +
    0.0722 * linearChannel(parsed.b)
  );
}

/**
 * Rapport de contraste WCAG entre deux couleurs opaques (1–21). Si la première
 * a un alpha, elle est d'abord composée sur la seconde.
 */
export function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) throw new Error(`Couleur illisible : ${foreground} / ${background}`);
  const composed =
    fg.a < 1
      ? rgbToHex({
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        })
      : rgbToHex(fg);
  const a = relativeLuminance(composed);
  const b = relativeLuminance(rgbToHex(bg));
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Parmi `candidates`, la couleur qui contraste le plus avec `background`. */
export function readableOn(background: string, candidates: readonly string[]): string {
  let best = candidates[0] ?? '#000000';
  let bestRatio = -1;
  for (const candidate of candidates) {
    let ratio = 0;
    try {
      ratio = contrastRatio(candidate, background);
    } catch {
      continue;
    }
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * Ajuste la luminosité de `color` par pas jusqu'à atteindre `minimum` de
 * contraste sur `background` (dans la direction qui l'éloigne du fond).
 */
export function ensureContrast(color: string, background: string, minimum: number): string {
  let current = toHex(color);
  if (contrastRatio(current, background) >= minimum) return current;
  const lighter = relativeLuminance(background) < 0.5;
  for (let step = 0; step < 40; step += 1) {
    current = lighten(current, lighter ? 2 : -2);
    if (contrastRatio(current, background) >= minimum) return current;
  }
  return lighter ? '#FFFFFF' : '#000000';
}
