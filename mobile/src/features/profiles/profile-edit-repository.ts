import * as Crypto from 'expo-crypto';

import { normalizeAvailableDates } from './profile-availability-model';
import type { EditableProfile } from './profile-edit-model';
import { normalizeEditableProfile, stringRecord } from './profile-edit-model';

import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type EditProjection = Pick<
  ProfileRow,
  | 'bio'
  | 'city'
  | 'country'
  | 'genres'
  | 'instrument_levels'
  | 'instruments'
  | 'name'
  | 'photo_url'
  | 'postal_code'
  | 'socials'
>;

type AvailabilityProjection = Pick<ProfileRow, 'available_dates'>;

export async function fetchAvailableDates(userId: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('available_dates')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return normalizeAvailableDates((data as AvailabilityProjection).available_dates);
}

export async function saveAvailableDates(userId: string, dates: string[]): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('profiles')
    .update({ available_dates: normalizeAvailableDates(dates) })
    .eq('id', userId)
    .select('id')
    .single();
  if (error) throw error;
}

export async function fetchEditableProfile(userId: string): Promise<EditableProfile> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select(
      'name,photo_url,bio,instruments,instrument_levels,genres,country,postal_code,city,socials',
    )
    .eq('id', userId)
    .single();
  if (error) throw error;
  const row = data as EditProjection;
  return {
    bio: row.bio,
    city: row.city ?? '',
    country: row.country ?? 'CH',
    genres: row.genres,
    instrumentLevels: stringRecord(row.instrument_levels),
    instruments: row.instruments,
    name: row.name,
    photoUrl: row.photo_url,
    postalCode: row.postal_code ?? '',
    socials: stringRecord(row.socials),
  };
}

export async function saveEditableProfile(userId: string, profile: EditableProfile): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('profiles')
    .update(normalizeEditableProfile(profile))
    .eq('id', userId);
  if (error) throw error;
}

export async function uploadProfileAvatar(userId: string, data: ArrayBuffer): Promise<string> {
  const supabase = getSupabaseClient();
  const path = `${userId.toLowerCase()}/avatar.jpg`;
  const uploaded = await supabase.storage.from('avatars').upload(path, data, {
    cacheControl: '3600',
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (uploaded.error) throw uploaded.error;
  const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
  const photoUrl = `${publicData.publicUrl}?v=${Crypto.randomUUID()}`;
  const { error } = await supabase
    .from('profiles')
    .update({ photo_url: photoUrl })
    .eq('id', userId);
  if (error) throw error;
  return photoUrl;
}
