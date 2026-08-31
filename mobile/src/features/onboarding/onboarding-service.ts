import {
  emptyOnboardingDraft,
  normalizeOnboardingDraft,
  type MusicianLevel,
  type OnboardingDraft,
} from './onboarding-model';

import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type OnboardingProjection = Pick<
  ProfileRow,
  'city' | 'country' | 'instruments' | 'level' | 'name' | 'postal_code'
>;

const knownLevels = new Set<MusicianLevel>([
  'Débutant',
  'Intermédiaire',
  'Avancé',
  'Professionnel',
]);

export async function fetchOnboardingDraft(userId: string): Promise<OnboardingDraft> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('name,instruments,level,country,postal_code,city')
    .eq('id', userId)
    .single();
  if (error) throw error;
  const profile = data as OnboardingProjection;
  return {
    city: profile.city ?? '',
    country: profile.country ?? emptyOnboardingDraft.country,
    instruments: profile.instruments,
    level: knownLevels.has(profile.level as MusicianLevel)
      ? (profile.level as MusicianLevel)
      : emptyOnboardingDraft.level,
    name: profile.name,
    postalCode: profile.postal_code ?? '',
  };
}

export async function saveOnboardingDraft(userId: string, draft: OnboardingDraft): Promise<void> {
  const value = normalizeOnboardingDraft(draft);
  const { error } = await getSupabaseClient()
    .from('profiles')
    .update({
      city: value.city,
      country: value.country,
      instruments: value.instruments,
      level: value.level,
      name: value.name,
      postal_code: value.postalCode,
    })
    .eq('id', userId);
  if (error) throw error;
}
