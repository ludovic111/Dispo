export interface ProfileConnection {
  id: string;
  instruments: string[];
  isDemo: boolean;
  level: string;
  name: string;
  photoUrl: string | null;
}

export interface ProfilePublicGroup {
  emoji: string;
  id: string;
  isLeader: boolean;
  memberCount: number;
  name: string;
  photoUrl: string | null;
}

export interface ProfileSocialState {
  hasPlayedWith: boolean;
  myRating: number | null;
  publicGroups: ProfilePublicGroup[];
}

export function canonicalCollaborationPair(firstId: string, secondId: string) {
  if (!firstId || !secondId || firstId === secondId) {
    throw new Error('profile_collaboration_invalid');
  }
  return firstId < secondId ? { a_id: firstId, b_id: secondId } : { a_id: secondId, b_id: firstId };
}

export function canRateProfile(level: string, hasPlayedWith: boolean): boolean {
  return level === 'Professionnel' && hasPlayedWith;
}

export function clampProfileRating(stars: number): number {
  if (!Number.isFinite(stars)) throw new Error('profile_rating_invalid');
  return Math.min(5, Math.max(1, Math.round(stars)));
}
