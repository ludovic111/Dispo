export const schoolRoles = ['student', 'teacher', 'alumni', 'staff', 'applicant', 'other'] as const;

export const schoolVisibilities = ['profile', 'school_only', 'private'] as const;

export type SchoolRole = (typeof schoolRoles)[number];
export type SchoolVisibility = (typeof schoolVisibilities)[number];
export type SchoolMembershipStatus = 'active' | 'left' | 'suspended';
export type SchoolVerificationLevel = 'self_declared' | 'verified';

export interface MusicSchool {
  city: string;
  countryCode: string;
  id: string;
  isVerified: boolean;
  logoUrl: string | null;
  name: string;
  shortName: string | null;
  slug: string;
  websiteUrl: string | null;
}

export interface SchoolAffiliation {
  id: string;
  isPrimary: boolean;
  joinedAt: string;
  memberCount: number;
  role: SchoolRole;
  roleLabel: string | null;
  school: MusicSchool;
  status: SchoolMembershipStatus;
  verificationLevel: SchoolVerificationLevel;
  visibility: SchoolVisibility;
}

export interface SchoolMember {
  instruments: string[];
  isPrimary: boolean;
  joinedAt: string;
  level: string;
  name: string;
  photoUrl: string | null;
  profileId: string;
  role: SchoolRole;
  roleLabel: string | null;
  verificationLevel: SchoolVerificationLevel;
}

export interface SchoolAffiliationDraft {
  role: SchoolRole;
  roleLabel: string;
  visibility: SchoolVisibility;
}

export interface NormalizedSchoolAffiliationInput {
  role: SchoolRole;
  roleLabel: string | null;
  schoolId: string;
  visibility: SchoolVisibility;
}

export function schoolDisplayName(school: MusicSchool): string {
  const shortName = school.shortName?.trim();
  return shortName || school.name;
}

export function schoolInitials(school: MusicSchool): string {
  return schoolDisplayName(school).trim().slice(0, 3).toLocaleUpperCase();
}

export function schoolRoleLabel(role: SchoolRole): string {
  switch (role) {
    case 'student':
      return 'Élève';
    case 'teacher':
      return 'Professeur·e';
    case 'alumni':
      return 'Ancien·ne élève';
    case 'staff':
      return 'Équipe';
    case 'applicant':
      return 'Candidat·e';
    case 'other':
      return 'Autre';
  }
}

export function schoolVisibilityLabel(visibility: SchoolVisibility): string {
  switch (visibility) {
    case 'profile':
      return 'Sur mon profil';
    case 'school_only':
      return "Membres de l'école";
    case 'private':
      return 'Moi uniquement';
  }
}

export function affiliationRoleLabel(
  affiliation: Pick<SchoolAffiliation | SchoolMember, 'role' | 'roleLabel'>,
): string {
  const custom = affiliation.roleLabel?.trim();
  return custom || schoolRoleLabel(affiliation.role);
}

export function affiliationStatusLabel(
  affiliation: Pick<SchoolAffiliation | SchoolMember, 'role' | 'roleLabel' | 'verificationLevel'>,
): string {
  const role = affiliationRoleLabel(affiliation);
  return affiliation.verificationLevel === 'verified' ? role : `${role} · déclaré`;
}

export function normalizeSchoolSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function filterSchools(schools: MusicSchool[], query: string): MusicSchool[] {
  const needle = normalizeSchoolSearch(query);
  if (!needle) return schools;
  return schools.filter((school) =>
    [school.name, school.shortName ?? '', school.city].some((value) =>
      normalizeSchoolSearch(value).includes(needle),
    ),
  );
}

export function sortSchools(
  schools: MusicSchool[],
  joinedSchoolIds: ReadonlySet<string>,
): MusicSchool[] {
  return [...schools].sort((left, right) => {
    const joinedDelta =
      Number(joinedSchoolIds.has(right.id)) - Number(joinedSchoolIds.has(left.id));
    if (joinedDelta !== 0) return joinedDelta;
    return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
  });
}

export function normalizeSchoolAffiliationInput(
  schoolId: string,
  draft: SchoolAffiliationDraft,
): NormalizedSchoolAffiliationInput {
  const roleLabel = draft.roleLabel.trim();
  if (!schoolId) throw new Error('school_required');
  if (!schoolRoles.includes(draft.role)) throw new Error('invalid_school_role');
  if (!schoolVisibilities.includes(draft.visibility)) {
    throw new Error('invalid_school_visibility');
  }
  if (draft.role === 'other' && !roleLabel) throw new Error('school_role_label_required');
  if (roleLabel.length > 80) throw new Error('invalid_school_role_label');
  return {
    role: draft.role,
    roleLabel: draft.role === 'other' ? roleLabel : null,
    schoolId,
    visibility: draft.visibility,
  };
}

export function schoolErrorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes('school_membership_limit_reached')) {
    return 'Tu peux rattacher au maximum cinq écoles actives.';
  }
  if (value.includes('school_membership_suspended')) {
    return "Cette affiliation est suspendue et ne peut pas être modifiée dans l'app.";
  }
  if (value.includes('school_not_available')) return "Cette école n'est plus disponible.";
  if (value.includes('school_role_label_required')) return 'Précise ton rôle.';
  if (value.includes('invalid_school_role_label'))
    return 'Le rôle doit contenir au maximum 80 caractères.';
  return "La connexion n'a pas abouti. Rien n'a été modifié.";
}
