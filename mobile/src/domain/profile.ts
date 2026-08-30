export interface SchoolAffiliation {
  id: string;
  logoUrl: string | null;
  name: string;
  shortName: string | null;
  slug: string;
}

export interface ProfileSummary {
  availableDates: string[];
  bio: string;
  city: string | null;
  country: string | null;
  genres: string[];
  id: string;
  instruments: string[];
  isFriend: boolean;
  isPremium: boolean;
  level: string;
  name: string;
  photoUrl: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  schools: SchoolAffiliation[];
  sharesSchool: boolean;
}

export type RelationshipFilter = 'all' | 'friend' | 'sameSchool';

export function isAmrSchool(school: SchoolAffiliation): boolean {
  return (
    school.slug.trim().toLowerCase() === 'amr' || school.shortName?.trim().toUpperCase() === 'AMR'
  );
}

export function relationshipMatches(
  profile: Pick<ProfileSummary, 'isFriend' | 'sharesSchool'>,
  filter: RelationshipFilter,
): boolean {
  if (filter === 'friend') return profile.isFriend;
  if (filter === 'sameSchool') return profile.sharesSchool;
  return true;
}

export function relationTags(profile: Pick<ProfileSummary, 'isFriend' | 'schools'>): string[] {
  const tags: string[] = [];
  if (profile.isFriend) tags.push('Ami');
  if (profile.schools.some(isAmrSchool)) tags.push('AMR');
  return tags;
}

export type SchoolLogoPresentation =
  { kind: 'image'; uri: string } | { initials: string; kind: 'fallback' };

export function schoolLogoPresentation(school: SchoolAffiliation): SchoolLogoPresentation {
  if (school.logoUrl?.startsWith('https://')) return { kind: 'image', uri: school.logoUrl };
  const initials = (school.shortName || school.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join('');
  return { initials: initials || 'É', kind: 'fallback' };
}
