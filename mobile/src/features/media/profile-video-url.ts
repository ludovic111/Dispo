const localDevelopmentHosts = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

export function isPlayableProfileVideoUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && localDevelopmentHosts.has(url.hostname.toLowerCase()))
    );
  } catch {
    return false;
  }
}
