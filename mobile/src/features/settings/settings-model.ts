export type AppearancePreference = 'dark' | 'light' | 'system';
export type LocationPrecision = 'city' | 'exact_everyone' | 'exact_friends' | 'hidden';
export type PushCategory = 'groups' | 'messages' | 'sos';

export interface PushPreferences {
  groups: boolean;
  messages: boolean;
  sos: boolean;
}

export const defaultPushPreferences: PushPreferences = {
  groups: true,
  messages: true,
  sos: true,
};

export const appearanceOptions: readonly {
  icon: 'contrast-outline' | 'moon' | 'sunny';
  label: string;
  value: AppearancePreference;
}[] = [
  { value: 'system', label: 'Système', icon: 'contrast-outline' },
  { value: 'light', label: 'Clair', icon: 'sunny' },
  { value: 'dark', label: 'Sombre', icon: 'moon' },
] as const;

export const locationOptions: readonly {
  detail: string;
  icon: 'business' | 'eye-off' | 'location' | 'people';
  label: string;
  value: LocationPrecision;
}[] = [
  {
    value: 'hidden',
    label: 'Ne pas partager ma position',
    detail: 'Aucune distance affichée — trouvable par nom et instrument',
    icon: 'eye-off',
  },
  {
    value: 'city',
    label: 'Approximative (ville)',
    detail: 'Recommandé — visible à ~5 km près',
    icon: 'business',
  },
  {
    value: 'exact_friends',
    label: 'Exacte pour mes amis',
    detail: 'Position précise pour les amis (suivi mutuel)',
    icon: 'people',
  },
  {
    value: 'exact_everyone',
    label: 'Exacte pour tous',
    detail: 'Position précise pour tout le réseau',
    icon: 'location',
  },
] as const;

export function notificationStatusLabel(
  permission: 'denied' | 'ephemeral' | 'granted' | 'provisional' | 'undetermined',
  enabled: boolean,
): string {
  if (permission === 'denied') return 'Bloquées dans Réglages';
  if (!enabled) return 'Désactivées';
  if (permission === 'granted') return 'Actives';
  if (permission === 'provisional') return 'Livraison discrète';
  if (permission === 'ephemeral') return 'Temporaires';
  return 'À configurer';
}

export function setPushCategory(
  preferences: PushPreferences,
  category: PushCategory,
  enabled: boolean,
): PushPreferences {
  return { ...preferences, [category]: enabled };
}

export function supportPage(locale: string): string {
  return locale === 'fr' ? 'https://dispoapp.net/support-fr' : 'https://dispoapp.net/support-en';
}

export function privacyPage(locale: string): string {
  return locale === 'fr' ? 'https://dispoapp.net/privacy' : 'https://dispoapp.net/privacy-en';
}

export function normalizeMarketingVersion(version: string): string {
  return version.replace(/\.0$/, '');
}

export type WhatsNewDecision = 'current' | 'first-install' | 'updated';

export function whatsNewDecision(
  previousVersion: string | null,
  currentVersion: string,
): WhatsNewDecision {
  if (!previousVersion) return 'first-install';
  return previousVersion === currentVersion ? 'current' : 'updated';
}
