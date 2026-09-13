import {
  emptyOnboardingDraft,
  isMusicianLevel,
  normalizeInstrumentLevels,
  normalizeInstruments,
  normalizeOnboardingDraft,
  type OnboardingDraft,
} from './onboarding-model';

import { getSupabaseClient } from '@/services/supabase/client';
import type { Database, Json } from '@/services/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type OnboardingProjection = Pick<
  ProfileRow,
  | 'city'
  | 'country'
  | 'genres'
  | 'instrument_levels'
  | 'instruments'
  | 'level'
  | 'name'
  | 'photo_url'
  | 'postal_code'
>;

function jsonRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Projection profil → brouillon ; les anciens instruments (« Saxophone ») sont normalisés. */
export function onboardingDraftFromProfile(profile: OnboardingProjection): OnboardingDraft {
  const instruments = normalizeInstruments(profile.instruments ?? []);
  return {
    city: profile.city ?? '',
    country: profile.country ?? emptyOnboardingDraft.country,
    genres: profile.genres ?? [],
    instrumentLevels: normalizeInstrumentLevels(jsonRecord(profile.instrument_levels), instruments),
    instruments,
    level: isMusicianLevel(profile.level) ? profile.level : emptyOnboardingDraft.level,
    name: profile.name,
    photoUrl: profile.photo_url ?? null,
    postalCode: profile.postal_code ?? '',
  };
}

export async function fetchOnboardingDraft(userId: string): Promise<OnboardingDraft> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('name,instruments,instrument_levels,level,genres,photo_url,country,postal_code,city')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return onboardingDraftFromProfile(data as OnboardingProjection);
}

export async function saveOnboardingDraft(userId: string, draft: OnboardingDraft): Promise<void> {
  const value = normalizeOnboardingDraft(draft);
  const { error } = await getSupabaseClient()
    .from('profiles')
    .update({
      city: value.city,
      country: value.country,
      genres: value.genres,
      instrument_levels: value.instrumentLevels,
      instruments: value.instruments,
      level: value.level,
      name: value.name,
      neighborhood: [value.postalCode, value.city].filter(Boolean).join(' '),
      postal_code: value.postalCode,
    })
    .eq('id', userId);
  if (error) throw error;
}
