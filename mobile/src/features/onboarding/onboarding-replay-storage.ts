import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OnboardingReplayPlace {
  city: string;
  country: string;
  postalCode: string;
}

export const emptyOnboardingReplayPlace: OnboardingReplayPlace = {
  city: '',
  country: 'CH',
  postalCode: '',
};

const placeKey = 'dispo.onboarding.replay-place.v1';
export const onboardingReplayQueryKey = ['onboarding-replay'] as const;

function normalizePlace(place: OnboardingReplayPlace): OnboardingReplayPlace {
  return {
    city: place.city.trim(),
    country: place.country.trim().toUpperCase() || emptyOnboardingReplayPlace.country,
    postalCode: place.postalCode.trim().toUpperCase(),
  };
}

function parsePlace(value: string | null): OnboardingReplayPlace {
  if (!value) return emptyOnboardingReplayPlace;
  try {
    const parsed = JSON.parse(value) as Partial<OnboardingReplayPlace>;
    return normalizePlace({
      city: typeof parsed.city === 'string' ? parsed.city : '',
      country:
        typeof parsed.country === 'string' ? parsed.country : emptyOnboardingReplayPlace.country,
      postalCode: typeof parsed.postalCode === 'string' ? parsed.postalCode : '',
    });
  } catch {
    return emptyOnboardingReplayPlace;
  }
}

export async function loadOnboardingReplayPlace(): Promise<OnboardingReplayPlace> {
  return parsePlace(await AsyncStorage.getItem(placeKey));
}

export async function saveOnboardingReplayPlace(place: OnboardingReplayPlace): Promise<void> {
  await AsyncStorage.setItem(placeKey, JSON.stringify(normalizePlace(place)));
}

export async function resetOnboardingReplayPlace(): Promise<void> {
  await AsyncStorage.removeItem(placeKey);
}
