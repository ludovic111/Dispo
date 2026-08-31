import type { Json } from '@/services/supabase/database.types';

export interface EditableProfile {
  availableDates: string[];
  bio: string;
  city: string;
  country: string;
  genres: string[];
  instrumentLevels: Record<string, string>;
  instruments: string[];
  name: string;
  photoUrl: string | null;
  postalCode: string;
  socials: Record<string, string>;
}

const levelOrder = ['Débutant', 'Intermédiaire', 'Avancé', 'Professionnel'] as const;

export function stringRecord(value: Json): Record<string, string> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [[key, entry]] : [],
    ),
  );
}

function cleanHandle(value: string): string {
  let handle = value.trim();
  for (const prefix of [
    'https://',
    'http://',
    'www.',
    'instagram.com/',
    'tiktok.com/',
    'youtube.com/',
    'x.com/',
    'twitter.com/',
  ]) {
    if (handle.toLowerCase().startsWith(prefix)) handle = handle.slice(prefix.length);
  }
  return handle.replace(/^@+|\/+$/g, '').trim();
}

export function normalizeEditableProfile(profile: EditableProfile) {
  const name = profile.name.trim().replace(/\s+/g, ' ');
  const city = profile.city.trim().replace(/\s+/g, ' ');
  const postalCode = profile.postalCode.trim().toUpperCase();
  const instruments = [
    ...new Set(profile.instruments.map((value) => value.trim()).filter(Boolean)),
  ];
  if (name.length < 2 || instruments.length === 0 || city.length < 2 || postalCode.length < 3) {
    throw new Error('profile_required_fields_missing');
  }
  const instrumentLevels = Object.fromEntries(
    instruments.flatMap((instrument) => {
      const level = profile.instrumentLevels[instrument];
      return level && levelOrder.includes(level as (typeof levelOrder)[number])
        ? [[instrument, level]]
        : [];
    }),
  );
  const globalLevel = instruments
    .map((instrument) => instrumentLevels[instrument])
    .filter((level): level is string => Boolean(level))
    .sort(
      (left, right) => levelOrder.indexOf(right as never) - levelOrder.indexOf(left as never),
    )[0];
  const socials = Object.fromEntries(
    Object.entries(profile.socials).flatMap(([network, value]) => {
      const handle = cleanHandle(value);
      return handle ? [[network, handle]] : [];
    }),
  );
  return {
    available_dates: [...new Set(profile.availableDates)].sort(),
    bio: profile.bio.trim(),
    city,
    country: profile.country.trim().toUpperCase(),
    genres: [...new Set(profile.genres)],
    instrument_levels: instrumentLevels,
    instruments,
    level: globalLevel ?? 'Intermédiaire',
    name,
    neighborhood: [postalCode, city].filter(Boolean).join(' '),
    postal_code: postalCode,
    socials,
  };
}

export function toggleProfileValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
