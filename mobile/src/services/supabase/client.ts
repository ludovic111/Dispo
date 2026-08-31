import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

import type { Database } from './database.types';

import { publicEnvironment } from '@/config/env';
import { secureSessionStorage } from '@/services/storage/secure-storage';

let client: SupabaseClient<Database> | null = null;

export function hasSupabaseConfiguration(): boolean {
  return publicEnvironment !== null;
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!publicEnvironment) {
    throw new Error('missing_supabase_configuration');
  }

  client ??= createClient<Database>(
    publicEnvironment.EXPO_PUBLIC_SUPABASE_URL,
    publicEnvironment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    },
  );

  return client;
}
