import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from './auth-context';

import { getSupabaseClient } from '@/services/supabase/client';

export type ModerationStatus = 'active' | 'banned' | 'suspended';

export interface AccountStatus {
  emailVerified: boolean;
  moderationReason: string | null;
  moderationStatus: ModerationStatus;
  /** Numéro masqué par le serveur (`+41 79 *** ** 12`), jamais le numéro complet. */
  phone: string | null;
  phoneVerified: boolean;
  requireEmailVerification: boolean;
  requirePhoneVerification: boolean;
  suspendedUntil: string | null;
}

export type AccountGateDecision =
  | { kind: 'banned'; reason: string | null }
  | { kind: 'open' }
  | { kind: 'suspended'; reason: string | null; until: string | null }
  | { email: boolean; kind: 'verify'; phone: boolean };

export const accountStatusKey = (userId: string) => ['account-status', userId] as const;

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Lecture tolérante de `get_my_account_status()` : tout champ absent retombe sur l'état ouvert. */
export function accountStatusFromResponse(value: unknown): AccountStatus {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const moderation = record.moderation_status;
  return {
    emailVerified: asBoolean(record.email_verified),
    moderationReason: asNullableString(record.moderation_reason),
    moderationStatus: moderation === 'banned' || moderation === 'suspended' ? moderation : 'active',
    phone: asNullableString(record.phone),
    phoneVerified: asBoolean(record.phone_verified),
    requireEmailVerification: asBoolean(record.require_email_verification),
    requirePhoneVerification: asBoolean(record.require_phone_verification),
    suspendedUntil: asNullableString(record.suspended_until),
  };
}

/** Décide de la porte d'entrée. Sans statut (chargement, erreur réseau), l'app reste ouverte. */
export function accountGateDecision(
  status: AccountStatus | undefined,
  now = new Date(),
): AccountGateDecision {
  if (!status) return { kind: 'open' };
  if (status.moderationStatus === 'banned') {
    return { kind: 'banned', reason: status.moderationReason };
  }
  if (status.moderationStatus === 'suspended') {
    const until = status.suspendedUntil ? new Date(status.suspendedUntil) : null;
    const expired = until !== null && !Number.isNaN(until.getTime()) && until <= now;
    if (!expired) {
      return { kind: 'suspended', reason: status.moderationReason, until: status.suspendedUntil };
    }
  }
  const email = status.requireEmailVerification && !status.emailVerified;
  const phone = status.requirePhoneVerification && !status.phoneVerified;
  if (email || phone) return { email, kind: 'verify', phone };
  return { kind: 'open' };
}

/**
 * Numéro au format E.164. `0791234567` devient `+41791234567` avec l'indicatif
 * par défaut ; `0041…` et `+41…` sont acceptés tels quels. `null` si invalide.
 */
export function normalizePhoneNumber(input: string, defaultCountryCode = '+41'): string | null {
  const trimmed = input.replace(/[\s().-]/g, '');
  if (!trimmed) return null;
  let candidate: string;
  if (trimmed.startsWith('+')) candidate = trimmed;
  else if (trimmed.startsWith('00')) candidate = `+${trimmed.slice(2)}`;
  else if (trimmed.startsWith('0')) candidate = `${defaultCountryCode}${trimmed.slice(1)}`;
  else candidate = `${defaultCountryCode}${trimmed}`;
  return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/** Supabase répond ainsi quand aucun fournisseur SMS n'est configuré côté serveur. */
export function isPhoneProviderUnavailableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  if (['phone_provider_disabled', 'sms_send_failed', 'provider_disabled'].includes(code))
    return true;
  return (
    /unsupported phone provider|sms provider|error sending sms|phone.*provider|provider.*sms/.test(
      message,
    ) ||
    (record.status === 500 && message.includes('sms'))
  );
}

type UntypedRpc = (
  name: string,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function callRpc(name: string): Promise<unknown> {
  const client = getSupabaseClient();
  const { data, error } = await (client.rpc as unknown as UntypedRpc).call(client, name);
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchAccountStatus(): Promise<AccountStatus> {
  return accountStatusFromResponse(await callRpc('get_my_account_status'));
}

export function useAccountStatus() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    enabled: Boolean(userId),
    queryFn: fetchAccountStatus,
    queryKey: accountStatusKey(userId),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useInvalidateAccountStatus() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const client = useQueryClient();
  return useCallback(
    () => client.invalidateQueries({ queryKey: accountStatusKey(userId) }),
    [client, userId],
  );
}

export async function resendEmailConfirmation(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resend({ email, type: 'signup' });
  if (error) throw error;
}

/** Envoie le code au nouveau numéro. Lève l'erreur brute : l'écran distingue « fournisseur absent ». */
export async function startPhoneVerification(phone: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ phone });
  if (error) throw error;
}

export async function confirmPhoneVerification(phone: string, token: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.verifyOtp({
    phone,
    token: token.trim(),
    type: 'phone_change',
  });
  if (error) throw error;
}
