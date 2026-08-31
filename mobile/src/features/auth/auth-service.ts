import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { getSupabaseClient } from '@/services/supabase/client';

export interface AuthCallbackResult {
  handled: boolean;
  recovery: boolean;
}

export interface AppleSignInResult {
  suggestedName: string | null;
}

function configuredScheme(): string {
  const configured = Constants.expoConfig?.scheme;
  if (Array.isArray(configured)) return configured[0] ?? 'dispo';
  return configured ?? 'dispo';
}

export function authCallbackUrl(): string {
  return `${configuredScheme()}://login-callback`;
}

export function isAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'login-callback';
  } catch {
    return false;
  }
}

function callbackParameters(url: string): URLSearchParams {
  const parsed = new URL(url);
  const parameters = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  fragment.forEach((value, key) => parameters.set(key, value));
  return parameters;
}

function randomNonce(length = 32): string {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  const bytes = Crypto.getRandomBytes(length);
  return Array.from(bytes, (byte) => charset[byte % charset.length]).join('');
}

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
    redirectTo: authCallbackUrl(),
  });
  if (error) throw error;
}

export async function handleAuthCallbackUrl(url: string): Promise<AuthCallbackResult> {
  if (!isAuthCallbackUrl(url)) return { handled: false, recovery: false };

  const parameters = callbackParameters(url);
  const callbackError = parameters.get('error_description') ?? parameters.get('error');
  if (callbackError) throw new Error(callbackError);

  const supabase = getSupabaseClient();
  const recovery = parameters.get('type') === 'recovery';
  const code = parameters.get('code');
  if (code) {
    const flowId = parameters.get('sb_flow_id') ?? undefined;
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) throw error;
    return { handled: true, recovery };
  }

  const accessToken = parameters.get('access_token');
  const refreshToken = parameters.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('auth_callback_tokens_missing');
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return { handled: true, recovery };
}

export async function updatePassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('password_too_short');
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw error;
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('apple_sign_in_unavailable');
  }

  const nonce = randomNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const credential = await AppleAuthentication.signInAsync({
    nonce: hashedNonce,
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('apple_identity_token_missing');

  const { error } = await getSupabaseClient().auth.signInWithIdToken({
    nonce,
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  const suggestedName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return { suggestedName: suggestedName || null };
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = authCallbackUrl();
  const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
    provider: 'google',
  });
  if (error) throw error;
  if (!data.url) throw new Error('google_oauth_url_missing');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('oauth_cancelled');
  const callback = await handleAuthCallbackUrl(result.url);
  if (!callback.handled) throw new Error('google_oauth_callback_invalid');
}

export async function linkAppleIdentity(): Promise<void> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('apple_sign_in_unavailable');
  }
  const nonce = randomNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const credential = await AppleAuthentication.signInAsync({
    nonce: hashedNonce,
    requestedScopes: [],
  });
  if (!credential.identityToken) throw new Error('apple_identity_token_missing');
  const { error } = await getSupabaseClient().auth.linkIdentity({
    nonce,
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
