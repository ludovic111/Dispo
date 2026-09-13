import { Platform } from 'react-native';
import { Passkey, type PasskeyCreateRequest, type PasskeyGetRequest } from 'react-native-passkey';

import { getSupabaseClient } from '@/services/supabase/client';

export function supportsPasskeys(): boolean {
  // Android remains unavailable until a production signing certificate is associated with the domain.
  if (Platform.OS !== 'ios') return false;
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

export function passkeyWasCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    error.error === 'UserCancelled'
  );
}

export async function registerPasskey(): Promise<void> {
  const auth = getSupabaseClient().auth;
  const { data, error } = await auth.passkey.startRegistration();
  if (error) throw error;
  // Both APIs consume WebAuthn JSON (base64url). The native library narrows
  // optional transport/extension types; the server remains the verifier.
  const result = await Passkey.create(data.options as PasskeyCreateRequest);
  const verified = await auth.passkey.verifyRegistration({
    challengeId: data.challenge_id,
    credential: {
      id: result.id,
      rawId: result.rawId,
      type: 'public-key',
      response: result.response,
      clientExtensionResults: {},
    },
  });
  if (verified.error) throw verified.error;
}

export async function signInWithPasskey(): Promise<void> {
  const auth = getSupabaseClient().auth;
  const { data, error } = await auth.passkey.startAuthentication();
  if (error) throw error;
  const result = await Passkey.get(data.options as PasskeyGetRequest);
  const verified = await auth.passkey.verifyAuthentication({
    challengeId: data.challenge_id,
    credential: {
      id: result.id,
      rawId: result.rawId ?? result.id,
      type: 'public-key',
      response: result.response,
      clientExtensionResults: {},
    },
  });
  if (verified.error) throw verified.error;
}

export async function listPasskeys() {
  const { data, error } = await getSupabaseClient().auth.passkey.list();
  if (error) throw error;
  return data;
}

export async function deletePasskey(passkeyId: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.passkey.delete({ passkeyId });
  if (error) throw error;
}
