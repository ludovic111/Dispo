/** AuthProvider consumes the original URL; credentials must never become a route. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  // Reject malformed external input before Expo Router's query-string decoder.
  // Its current transitive decoder has an expensive invalid-UTF-8 fallback.
  if (path.length > 8_192) return '/';
  try {
    decodeURIComponent(path);
  } catch {
    return '/';
  }
  try {
    if (new URL(path).hostname === 'login-callback') return '/';
  } catch {
    // Expo also passes relative internal routes here.
  }
  return path;
}
