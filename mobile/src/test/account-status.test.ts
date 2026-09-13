import { describe, expect, it, jest } from '@jest/globals';

import {
  accountGateDecision,
  accountStatusFromResponse,
  fetchAccountStatus,
  isPhoneProviderUnavailableError,
  isValidOtpCode,
  normalizePhoneNumber,
  type AccountStatus,
} from '@/features/auth/account-status';

const mockRpc = jest.fn<(name: string) => Promise<{ data: unknown; error: unknown }>>();

jest.mock('@/services/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
  hasSupabaseConfiguration: () => true,
}));

const open: AccountStatus = {
  emailVerified: true,
  moderationReason: null,
  moderationStatus: 'active',
  phone: null,
  phoneVerified: false,
  requireEmailVerification: false,
  requirePhoneVerification: false,
  suspendedUntil: null,
};

describe('lecture du statut de compte', () => {
  it('lit la réponse serveur et retombe sur un état ouvert pour tout champ manquant', () => {
    expect(
      accountStatusFromResponse({
        email_verified: true,
        moderation_reason: 'Spam',
        moderation_status: 'suspended',
        phone: '+41 79 *** ** 12',
        phone_verified: false,
        require_email_verification: false,
        require_phone_verification: true,
        suspended_until: '2026-10-01T00:00:00+00:00',
      }),
    ).toEqual({
      emailVerified: true,
      moderationReason: 'Spam',
      moderationStatus: 'suspended',
      phone: '+41 79 *** ** 12',
      phoneVerified: false,
      requireEmailVerification: false,
      requirePhoneVerification: true,
      suspendedUntil: '2026-10-01T00:00:00+00:00',
    });
    expect(accountStatusFromResponse(null)).toEqual({ ...open, emailVerified: false });
    expect(accountStatusFromResponse({ moderation_status: 'weird' }).moderationStatus).toBe(
      'active',
    );
  });

  it('appelle la RPC et propage son erreur', async () => {
    mockRpc.mockResolvedValueOnce({ data: { email_verified: true }, error: null });
    await expect(fetchAccountStatus()).resolves.toMatchObject({ emailVerified: true });
    expect(mockRpc).toHaveBeenCalledWith('get_my_account_status');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchAccountStatus()).rejects.toThrow('boom');
  });
});

describe('porte d’entrée du compte', () => {
  const now = new Date('2026-09-13T12:00:00Z');

  it('reste ouverte sans statut ou pour un compte actif', () => {
    expect(accountGateDecision(undefined, now)).toEqual({ kind: 'open' });
    expect(accountGateDecision(open, now)).toEqual({ kind: 'open' });
  });

  it('bloque un compte banni ou suspendu, et rouvre une suspension expirée', () => {
    expect(
      accountGateDecision({ ...open, moderationReason: 'Abus', moderationStatus: 'banned' }, now),
    ).toEqual({ kind: 'banned', reason: 'Abus' });
    expect(
      accountGateDecision(
        { ...open, moderationStatus: 'suspended', suspendedUntil: '2026-09-20T00:00:00Z' },
        now,
      ),
    ).toEqual({ kind: 'suspended', reason: null, until: '2026-09-20T00:00:00Z' });
    expect(
      accountGateDecision({ ...open, moderationStatus: 'suspended', suspendedUntil: null }, now),
    ).toEqual({ kind: 'suspended', reason: null, until: null });
    expect(
      accountGateDecision(
        { ...open, moderationStatus: 'suspended', suspendedUntil: '2026-09-01T00:00:00Z' },
        now,
      ),
    ).toEqual({ kind: 'open' });
  });

  it('exige la vérification seulement quand le serveur la demande et qu’elle manque', () => {
    expect(accountGateDecision({ ...open, requirePhoneVerification: true }, now)).toEqual({
      email: false,
      kind: 'verify',
      phone: true,
    });
    expect(
      accountGateDecision({ ...open, phoneVerified: true, requirePhoneVerification: true }, now),
    ).toEqual({ kind: 'open' });
    expect(
      accountGateDecision({ ...open, emailVerified: false, requireEmailVerification: true }, now),
    ).toEqual({ email: true, kind: 'verify', phone: false });
    expect(accountGateDecision({ ...open, emailVerified: false }, now)).toEqual({ kind: 'open' });
  });
});

describe('numéro de téléphone et code SMS', () => {
  it('normalise vers E.164 avec +41 par défaut', () => {
    expect(normalizePhoneNumber('079 123 45 12')).toBe('+41791234512');
    expect(normalizePhoneNumber('+41 79 123 45 12')).toBe('+41791234512');
    expect(normalizePhoneNumber('0041 79 123 45 12')).toBe('+41791234512');
    expect(normalizePhoneNumber('(079) 123-45-12')).toBe('+41791234512');
    expect(normalizePhoneNumber('06 12 34 56 78', '+33')).toBe('+33612345678');
    expect(normalizePhoneNumber('791234512')).toBe('+41791234512');
    expect(normalizePhoneNumber('')).toBeNull();
    expect(normalizePhoneNumber('+41 ')).toBeNull();
    expect(normalizePhoneNumber('abc')).toBeNull();
    expect(normalizePhoneNumber('+0123456789')).toBeNull();
  });

  it('accepte uniquement un code à six chiffres', () => {
    expect(isValidOtpCode('123456')).toBe(true);
    expect(isValidOtpCode(' 123456 ')).toBe(true);
    expect(isValidOtpCode('12345')).toBe(false);
    expect(isValidOtpCode('12345a')).toBe(false);
  });

  it('reconnaît l’absence de fournisseur SMS sans confondre les autres erreurs', () => {
    expect(isPhoneProviderUnavailableError({ message: 'Unsupported phone provider' })).toBe(true);
    expect(isPhoneProviderUnavailableError({ code: 'sms_send_failed', message: 'x' })).toBe(true);
    expect(isPhoneProviderUnavailableError({ message: 'Error sending sms OTP', status: 500 })).toBe(
      true,
    );
    expect(isPhoneProviderUnavailableError({ message: 'Invalid phone number' })).toBe(false);
    expect(isPhoneProviderUnavailableError(new Error('network'))).toBe(false);
    expect(isPhoneProviderUnavailableError(null)).toBe(false);
  });
});
