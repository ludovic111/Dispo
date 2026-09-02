export type GroupCreationErrorKind = 'auth' | 'limit' | 'network' | 'unknown';

interface GroupCreationLock {
  current: boolean;
}

function errorField(error: unknown, field: 'code' | 'details' | 'hint' | 'message'): string {
  if (!error || typeof error !== 'object') return '';
  const value = Reflect.get(error, field);
  return typeof value === 'string' ? value : '';
}

export function groupCreationErrorKind(error: unknown): GroupCreationErrorKind {
  const code = errorField(error, 'code');
  const message = error instanceof Error ? error.message : errorField(error, 'message');
  const combined = [code, message, errorField(error, 'details'), errorField(error, 'hint')]
    .join(' ')
    .toLocaleLowerCase('en');
  if (combined.includes('premium_required_for_additional_group')) return 'limit';
  if (
    combined.includes('group_auth_required') ||
    combined.includes('authsessionmissingerror') ||
    combined.includes('jwt expired') ||
    combined.includes('invalid jwt') ||
    combined.includes('not authenticated') ||
    code === 'PGRST301'
  )
    return 'auth';
  if (
    error instanceof TypeError ||
    combined.includes('network request failed') ||
    combined.includes('failed to fetch') ||
    combined.includes('fetch failed') ||
    combined.includes('networkerror') ||
    combined.includes('timed out') ||
    combined.includes('timeout')
  )
    return 'network';
  return 'unknown';
}

export function groupCreationErrorMessage(error: unknown): string {
  switch (groupCreationErrorKind(error)) {
    case 'auth':
      return 'Ta session a expiré. Reconnecte-toi pour créer un groupe.';
    case 'limit':
      return 'Tu as atteint la limite de groupes que tu peux diriger.';
    case 'network':
      return 'Connexion impossible — vérifie le réseau.';
    default:
      return "Le groupe n'a pas pu être créé sur le serveur.";
  }
}

function sanitizedDiagnosticValue(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .slice(0, 500);
}

export function groupCreationDiagnostic(error: unknown): Record<string, string | null> {
  const message = error instanceof Error ? error.message : errorField(error, 'message');
  const value = (field: 'code' | 'details' | 'hint' | 'message') => {
    const raw = field === 'message' ? message : errorField(error, field);
    return raw ? sanitizedDiagnosticValue(raw) : null;
  };
  return {
    code: value('code'),
    details: value('details'),
    hint: value('hint'),
    message: value('message'),
  };
}

export function acquireGroupCreationLock(lock: GroupCreationLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseGroupCreationLock(lock: GroupCreationLock): void {
  lock.current = false;
}
