import { describe, expect, it, jest } from '@jest/globals';
import type { Session } from '@supabase/supabase-js';

import { canReadLockedGig, hasPremiumAccess, type PremiumProfile } from '@/domain/premium';
import {
  requestPasswordReset,
  restoreSession,
  type SessionStore,
} from '@/features/auth/auth-service';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

describe('restauration de session', () => {
  it('retourne la session persistée', async () => {
    const session = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: { id: 'user-1' },
    } as unknown as Session;
    const store: SessionStore = {
      getSession: async () => ({ data: { session }, error: null }),
    };

    await expect(restoreSession(store)).resolves.toBe(session);
  });

  it('retourne null lorsque rien ne peut être restauré', async () => {
    const store: SessionStore = {
      getSession: async () => ({ data: { session: null }, error: null }),
    };

    await expect(restoreSession(store)).resolves.toBeNull();
  });

  it('propage exactement l’erreur du stockage de session', async () => {
    const failure = new Error('session_restore_failed');
    const store: SessionStore = {
      getSession: async () => ({ data: { session: null }, error: failure }),
    };

    await expect(restoreSession(store)).rejects.toBe(failure);
  });
});

describe('réinitialisation du mot de passe', () => {
  it('normalise l’adresse et utilise le callback natif uniquement sur demande', async () => {
    const resetPasswordForEmail = jest.fn(async () => ({ data: {}, error: null }));
    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: { resetPasswordForEmail },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    await requestPasswordReset('  MUSICIEN@EXEMPLE.CH ');

    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmail).toHaveBeenCalledWith('musicien@exemple.ch', {
      redirectTo: 'dispo://login-callback',
    });
  });

  it('propage l’erreur Supabase sans seconde tentative implicite', async () => {
    const failure = new Error('network_failed');
    const resetPasswordForEmail = jest.fn(async () => ({ data: {}, error: failure }));
    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: { resetPasswordForEmail },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    await expect(requestPasswordReset('musicien@exemple.ch')).rejects.toBe(failure);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });
});

describe('Premium autoritaire côté serveur', () => {
  it('accorde Premium uniquement à partir du profil serveur', () => {
    const forgedClientMetadata = {
      isPremium: false,
      user_metadata: { is_premium: true },
    } as PremiumProfile & { user_metadata: { is_premium: boolean } };

    expect(hasPremiumAccess({ isPremium: true })).toBe(true);
    expect(hasPremiumAccess(forgedClientMetadata)).toBe(false);
    expect(hasPremiumAccess(null)).toBe(false);
  });

  it('laisse les SOS publics accessibles mais protège les SOS verrouillés', () => {
    expect(canReadLockedGig(false, null)).toBe(true);
    expect(canReadLockedGig(true, { isPremium: false })).toBe(false);
    expect(canReadLockedGig(true, { isPremium: true })).toBe(true);
  });
});
