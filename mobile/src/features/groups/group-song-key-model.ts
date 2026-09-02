export const musicalKeyOptions = [
  'C',
  'Cm',
  'C♯',
  'C♯m',
  'D',
  'Dm',
  'E♭',
  'D♯m',
  'E',
  'Em',
  'F',
  'Fm',
  'G♭',
  'F♯m',
  'G',
  'Gm',
  'A♭',
  'G♯m',
  'A',
  'Am',
  'B♭',
  'B♭m',
  'B',
  'Bm',
] as const;

const naturalPitchClasses: Record<string, number> = {
  A: 9,
  B: 11,
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
};

interface ParsedMusicalKey {
  minor: boolean;
  pitchClass: number;
}

export function parseMusicalKey(value: string | null | undefined): ParsedMusicalKey | null {
  const match = value?.trim().match(/^([A-Ga-g])([#♯b♭]?)(m)?$/u);
  if (!match) return null;
  const note = match[1]?.toLocaleUpperCase('en');
  if (!note) return null;
  const naturalPitchClass = naturalPitchClasses[note];
  if (naturalPitchClass === undefined) return null;
  const accidental = match[2] ?? '';
  const offset =
    accidental === '#' || accidental === '♯'
      ? 1
      : accidental === 'b' || accidental === '♭'
        ? -1
        : 0;
  return {
    minor: Boolean(match[3]),
    pitchClass: (naturalPitchClass + offset + 12) % 12,
  };
}

export function musicalKeysEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const parsedLeft = parseMusicalKey(left);
  const parsedRight = parseMusicalKey(right);
  return Boolean(
    parsedLeft &&
    parsedRight &&
    parsedLeft.minor === parsedRight.minor &&
    parsedLeft.pitchClass === parsedRight.pitchClass,
  );
}

export function isKnownMusicalKey(value: string | null | undefined): boolean {
  return parseMusicalKey(value) !== null;
}
