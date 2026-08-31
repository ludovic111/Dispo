export interface DisconnectDependencies {
  clearPushToken: () => Promise<void>;
  loadPushToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  unregisterPushDevice: (token: string) => Promise<void>;
}

/**
 * Push cleanup is best effort: an offline device must never trap the user in
 * their authenticated session. Authentication errors are still propagated so
 * the UI can report a real sign-out failure.
 */
export async function disconnectWithBestEffortPushCleanup({
  clearPushToken,
  loadPushToken,
  signOut,
  unregisterPushDevice,
}: DisconnectDependencies): Promise<void> {
  const token = await loadPushToken().catch(() => null);
  if (token) {
    await unregisterPushDevice(token).catch(() => undefined);
    await clearPushToken().catch(() => undefined);
  }
  await signOut();
}
