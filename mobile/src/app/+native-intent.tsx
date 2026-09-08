/** AuthProvider consumes the original URL; credentials must never become a route. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (new URL(path).hostname === 'login-callback') return '/';
  } catch {
    // Expo also passes relative internal routes here.
  }
  return path;
}
