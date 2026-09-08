/** Translate the moderation rejection without exposing a server error code. */
export function communityContentMessage(error: unknown, fallback: string): string {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    error.message === 'content_not_allowed'
    ? 'Ce texte ne respecte pas les règles de la communauté. Modifie-le avant de publier.'
    : fallback;
}
