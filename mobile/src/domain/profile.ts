export interface SchoolAffiliation {
  id: string;
  logoUrl: string | null;
  name: string;
  shortName: string | null;
  slug: string;
}

export interface ProfileDemoVideo {
  date: string | null;
  id: string;
  path: string;
  thumbUrl: string | null;
  title: string | null;
  url: string;
}

export interface ProfileAvailabilityPlace {
  city: string;
  country: string | null;
  from: string;
  id: string;
  postalCode: string | null;
  to: string;
}

export type ProfileSocialNetwork = 'instagram' | 'tiktok' | 'x' | 'youtube';
export type ProfileSocials = Partial<Record<ProfileSocialNetwork, string>>;

export interface ProfileSummary {
  age?: number | null;
  availabilityPlaces?: ProfileAvailabilityPlace[];
  availableDates: string[];
  bio: string;
  city: string | null;
  collaborationCount: number;
  country: string | null;
  genres: string[];
  id: string;
  instrumentLevels: Record<string, string>;
  instruments: string[];
  isDemo?: boolean;
  hasExactLocation?: boolean;
  isFriend: boolean;
  isPremium: boolean;
  latitude: number | null;
  level: string;
  longitude: number | null;
  name: string;
  neighborhood?: string;
  photoUrl: string | null;
  playedWithFriend: boolean;
  postalCode: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  repertoire?: string[];
  relationship: 'follower' | 'following' | 'friend' | 'none';
  schools: SchoolAffiliation[];
  sharesSchool: boolean;
  socials?: ProfileSocials;
  demoVideos?: ProfileDemoVideo[];
  locationPrecision?: string;
  followerCount: number;
}

export function profileHandle(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\p{N}]+/gu, '.')
    .replace(/^\.+|\.+$/g, '');
  return `@${normalized || 'musicien'}`;
}

export function profileSocialUrl(network: ProfileSocialNetwork, rawHandle: string): string | null {
  let handle = rawHandle.trim();
  for (const prefix of [
    'https://',
    'http://',
    'www.',
    'instagram.com/',
    'tiktok.com/',
    'youtube.com/',
    'x.com/',
    'twitter.com/',
  ]) {
    if (handle.toLocaleLowerCase('en').startsWith(prefix)) handle = handle.slice(prefix.length);
  }
  handle = handle.replace(/^[@/\s]+|[/\s]+$/g, '');
  if (!handle || /[\s<>]/.test(handle)) return null;
  if (network === 'instagram') return `https://instagram.com/${handle}`;
  if (network === 'tiktok') return `https://tiktok.com/@${handle}`;
  if (network === 'youtube') return `https://youtube.com/@${handle}`;
  return `https://x.com/${handle}`;
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

export function relationTags(
  profile: Pick<ProfileSummary, 'isFriend' | 'schools'> &
    Partial<Pick<ProfileSummary, 'playedWithFriend' | 'relationship' | 'sharesSchool'>>,
): string[] {
  const tags: string[] = [];
  if (profile.isFriend || profile.relationship === 'friend') tags.push('Ami');
  else if (profile.relationship === 'following') tags.push('Suivi');
  else if (profile.relationship === 'follower') tags.push('Te suit');
  if (profile.schools.some(isAmrSchool)) tags.push('AMR');
  if (profile.sharesSchool) tags.push('Même école');
  if (profile.playedWithFriend) tags.push('Relation commune');
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
