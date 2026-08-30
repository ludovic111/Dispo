import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/services/supabase/client';

const passwordResetRedirectUrl = 'dispo://login-callback';

export interface SessionStore {
  getSession(): Promise<{ data: { session: Session | null }; error: Error | null }>;
}

export async function restoreSession(store: SessionStore): Promise<Session | null> {
  const { data, error } = await store.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('missing_email');

  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: passwordResetRedirectUrl,
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
