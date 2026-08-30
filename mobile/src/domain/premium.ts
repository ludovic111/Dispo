export interface PremiumProfile {
  isPremium: boolean;
}

/** Premium is server-authoritative; auth user_metadata is deliberately ignored. */
export function hasPremiumAccess(profile: PremiumProfile | null): boolean {
  return profile?.isPremium === true;
}

export function canReadLockedGig(isLocked: boolean, profile: PremiumProfile | null): boolean {
  return !isLocked || hasPremiumAccess(profile);
}
