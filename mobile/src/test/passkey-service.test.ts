import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  deletePasskey,
  listPasskeys,
  passkeyWasCancelled,
  registerPasskey,
  signInWithPasskey,
} from '@/features/auth/passkey-service';

const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGet = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockApi = {
  startRegistration: jest.fn<() => Promise<unknown>>(),
  verifyRegistration: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  startAuthentication: jest.fn<() => Promise<unknown>>(),
  verifyAuthentication: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  list: jest.fn<() => Promise<unknown>>(),
  delete: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
};
jest.mock('react-native-passkey', () => ({
  Passkey: {
    create: (...args: unknown[]) => mockCreate(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));
jest.mock('@/services/supabase/client', () => ({
  getSupabaseClient: () => ({ auth: { passkey: mockApi } }),
}));

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.startRegistration.mockResolvedValue({
    data: {
      challenge_id: 'register-challenge',
      options: { challenge: 'abc', rp: { id: 'dispoapp.net' } },
    },
    error: null,
  });
  mockApi.startAuthentication.mockResolvedValue({
    data: { challenge_id: 'login-challenge', options: { challenge: 'xyz', rpId: 'dispoapp.net' } },
    error: null,
  });
  mockCreate.mockResolvedValue({
    id: 'credential',
    rawId: 'credential',
    response: { clientDataJSON: 'client', attestationObject: 'attestation' },
  });
  mockGet.mockResolvedValue({
    id: 'credential',
    response: { clientDataJSON: 'client', authenticatorData: 'auth', signature: 'signature' },
  });
  mockApi.verifyRegistration.mockResolvedValue({ error: null });
  mockApi.verifyAuthentication.mockResolvedValue({ error: null });
});

describe('native passkey authentication', () => {
  it('sends the native attestation with its registration challenge to the server', async () => {
    await registerPasskey();
    expect(mockCreate).toHaveBeenCalledWith({ challenge: 'abc', rp: { id: 'dispoapp.net' } });
    expect(mockApi.verifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'register-challenge',
        credential: expect.objectContaining({
          response: { clientDataJSON: 'client', attestationObject: 'attestation' },
          type: 'public-key',
        }),
      }),
    );
  });
  it('never accepts a native credential when server verification fails', async () => {
    const failure = new Error('webauthn_verification_failed');
    mockApi.verifyAuthentication.mockResolvedValue({ error: failure });
    await expect(signInWithPasskey()).rejects.toBe(failure);
    expect(mockApi.verifyAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'login-challenge',
        credential: expect.objectContaining({
          rawId: 'credential',
          response: expect.objectContaining({ signature: 'signature' }),
        }),
      }),
    );
  });
  it('does not start a native ceremony when the backend refuses registration', async () => {
    mockApi.startRegistration.mockResolvedValue({
      data: null,
      error: new Error('passkey_disabled'),
    });
    await expect(registerPasskey()).rejects.toThrow('passkey_disabled');
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('cancellation never reaches the verification endpoint', async () => {
    const cancel = { error: 'UserCancelled' };
    mockGet.mockRejectedValue(cancel);
    await expect(signInWithPasskey()).rejects.toEqual(cancel);
    expect(passkeyWasCancelled(cancel)).toBe(true);
    expect(passkeyWasCancelled(new Error('network'))).toBe(false);
    expect(mockApi.verifyAuthentication).not.toHaveBeenCalled();
  });
  it('propagates failed removal and listing instead of claiming success', async () => {
    mockApi.delete.mockResolvedValue({ error: new Error('offline') });
    mockApi.list.mockResolvedValue({ error: new Error('offline') });
    await expect(deletePasskey('key-id')).rejects.toThrow('offline');
    expect(mockApi.delete).toHaveBeenCalledWith({ passkeyId: 'key-id' });
    await expect(listPasskeys()).rejects.toThrow('offline');
  });
});
