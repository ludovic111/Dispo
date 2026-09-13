import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  emptyOnboardingDraft,
  isMusicianLevel,
  normalizeOnboardingDraft,
  onboardingSteps,
  type MusicianLevel,
  type OnboardingDraft,
  type OnboardingSchoolRole,
  onboardingSchoolRoles,
} from './onboarding-model';

/** Brouillon local du parcours post-connexion : survit à une app tuée entre deux étapes. */
export interface OnboardingProgress {
  draft: OnboardingDraft;
  savedAt: string;
  schoolId: string | null;
  schoolRole: OnboardingSchoolRole;
  step: number;
  userId: string;
}

const storageKey = 'dispo.onboarding.progress.v1';

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function levelRecord(value: unknown): Record<string, MusicianLevel> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, level]) =>
      isMusicianLevel(level) ? [[key, level]] : [],
    ),
  );
}

export function parseOnboardingProgress(
  raw: string | null,
  userId: string,
): OnboardingProgress | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingProgress> & {
      draft?: Partial<OnboardingDraft>;
    };
    if (parsed.userId !== userId || !parsed.draft || typeof parsed.draft !== 'object') return null;
    const draft = parsed.draft;
    const step = typeof parsed.step === 'number' && Number.isFinite(parsed.step) ? parsed.step : 0;
    return {
      draft: normalizeOnboardingDraft({
        city: typeof draft.city === 'string' ? draft.city : '',
        country: typeof draft.country === 'string' ? draft.country : emptyOnboardingDraft.country,
        genres: stringList(draft.genres),
        instrumentLevels: levelRecord(draft.instrumentLevels),
        instruments: stringList(draft.instruments),
        level: isMusicianLevel(draft.level) ? draft.level : emptyOnboardingDraft.level,
        name: typeof draft.name === 'string' ? draft.name : '',
        photoUrl: typeof draft.photoUrl === 'string' ? draft.photoUrl : null,
        postalCode: typeof draft.postalCode === 'string' ? draft.postalCode : '',
      }),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
      schoolId: typeof parsed.schoolId === 'string' && parsed.schoolId ? parsed.schoolId : null,
      schoolRole: (onboardingSchoolRoles as readonly string[]).includes(parsed.schoolRole ?? '')
        ? (parsed.schoolRole as OnboardingSchoolRole)
        : 'student',
      step: Math.min(Math.max(Math.trunc(step), 0), onboardingSteps.length - 1),
      userId,
    };
  } catch {
    return null;
  }
}

export async function loadOnboardingProgress(userId: string): Promise<OnboardingProgress | null> {
  return parseOnboardingProgress(await AsyncStorage.getItem(storageKey), userId);
}

export async function saveOnboardingProgress(
  progress: Omit<OnboardingProgress, 'savedAt'>,
): Promise<void> {
  const value: OnboardingProgress = { ...progress, savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(storageKey, JSON.stringify(value));
}

export async function clearOnboardingProgress(): Promise<void> {
  await AsyncStorage.removeItem(storageKey);
}
