import { describe, expect, it, jest } from '@jest/globals';

import { disconnectWithBestEffortPushCleanup } from '@/features/settings/account-session';

describe('déconnexion', () => {
  it('termine la session même si la désinscription push échoue hors ligne', async () => {
    const clearPushToken = jest.fn<() => Promise<void>>().mockResolvedValue();
    const signOut = jest.fn<() => Promise<void>>().mockResolvedValue();
    const unregisterPushDevice = jest
      .fn<(token: string) => Promise<void>>()
      .mockRejectedValue(new Error('offline'));

    await disconnectWithBestEffortPushCleanup({
      clearPushToken,
      loadPushToken: jest.fn<() => Promise<string | null>>().mockResolvedValue('push-token'),
      signOut,
      unregisterPushDevice,
    });

    expect(unregisterPushDevice).toHaveBeenCalledWith('push-token');
    expect(clearPushToken).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("ne masque pas une vraie erreur d'authentification", async () => {
    const error = new Error('auth-sign-out-failed');
    await expect(
      disconnectWithBestEffortPushCleanup({
        clearPushToken: jest.fn<() => Promise<void>>().mockResolvedValue(),
        loadPushToken: jest.fn<() => Promise<string | null>>().mockRejectedValue(new Error('disk')),
        signOut: jest.fn<() => Promise<void>>().mockRejectedValue(error),
        unregisterPushDevice: jest.fn<(token: string) => Promise<void>>().mockResolvedValue(),
      }),
    ).rejects.toBe(error);
  });
});
