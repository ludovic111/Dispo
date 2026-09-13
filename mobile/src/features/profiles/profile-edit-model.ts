import {
  normalizeInstrumentLevels,
  normalizeInstruments,
} from '@/features/onboarding/onboarding-model';
import type { Json } from '@/services/supabase/database.types';

export interface EditableProfile {
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
  const instruments = normalizeInstruments(profile.instruments);
  if (name.length < 2 || instruments.length === 0 || city.length < 2 || postalCode.length < 3) {
    throw new Error('profile_required_fields_missing');
  }
  const instrumentLevels: Record<string, string> = normalizeInstrumentLevels(
    profile.instrumentLevels,
    instruments,
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

/**
 * Ramène les instruments hérités d'un profil (« Saxophone ») vers ceux des sélecteurs
 * actuels, pour que la fiche d'édition affiche la bonne puce présélectionnée.
 */
export function withCurrentInstruments(profile: EditableProfile): EditableProfile {
  const instruments = normalizeInstruments(profile.instruments);
  return {
    ...profile,
    instrumentLevels: normalizeInstrumentLevels(profile.instrumentLevels, instruments),
    instruments,
  };
}

export function toggleProfileValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
