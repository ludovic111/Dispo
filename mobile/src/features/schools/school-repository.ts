import type {
  MusicSchool,
  NormalizedSchoolAffiliationInput,
  SchoolAffiliation,
  SchoolMember,
  SchoolMembershipStatus,
  SchoolRole,
  SchoolVerificationLevel,
  SchoolVisibility,
} from './school-model';

import { pageRange, type Page } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type SchoolRow = Pick<
  Database['public']['Tables']['music_schools']['Row'],
  | 'city'
  | 'country_code'
  | 'id'
  | 'is_verified'
  | 'logo_url'
  | 'name'
  | 'short_name'
  | 'slug'
  | 'website_url'
>;

type MySchoolRpcRow = Database['public']['Functions']['my_music_schools']['Returns'][number];
interface SchoolMemberRow {
  is_primary: boolean;
  joined_at: string;
  profile_id: string;
  profiles: {
    instruments: string[];
    level: string;
    name: string;
    photo_url: string | null;
  };
  role: string;
  role_label: string | null;
  verification_level: string;
}

const schoolColumns =
  'id,slug,name,short_name,city,country_code,website_url,logo_url,is_verified' as const;

function mapSchool(row: SchoolRow): MusicSchool {
  return {
    city: row.city,
    countryCode: row.country_code,
    id: row.id,
    isVerified: row.is_verified,
    logoUrl: row.logo_url,
    name: row.name,
    shortName: row.short_name,
    slug: row.slug,
    websiteUrl: row.website_url,
  };
}

function isSchoolRole(value: string): value is SchoolRole {
  return ['student', 'teacher', 'alumni', 'staff', 'applicant', 'other'].includes(value);
}

function isSchoolVisibility(value: string): value is SchoolVisibility {
  return ['profile', 'school_only', 'private'].includes(value);
}

function isVerificationLevel(value: string): value is SchoolVerificationLevel {
  return value === 'self_declared' || value === 'verified';
}

function mapMyAffiliation(row: MySchoolRpcRow): SchoolAffiliation | null {
  if (
    !isSchoolRole(row.role) ||
    !isSchoolVisibility(row.visibility) ||
    !isVerificationLevel(row.verification_level)
  ) {
    return null;
  }
  return {
    id: row.membership_id,
    isPrimary: row.is_primary,
    joinedAt: row.joined_at,
    memberCount: row.member_count,
    role: row.role,
    roleLabel: row.role_label || null,
    school: {
      city: row.city,
      countryCode: row.country_code,
      id: row.school_id,
      isVerified: row.is_verified,
      logoUrl: row.logo_url || null,
      name: row.name,
      shortName: row.short_name || null,
      slug: row.slug,
      websiteUrl: null,
    },
    status: 'active' satisfies SchoolMembershipStatus,
    verificationLevel: row.verification_level,
    visibility: row.visibility,
  };
}

function mapMember(row: SchoolMemberRow): SchoolMember | null {
  if (!isSchoolRole(row.role) || !isVerificationLevel(row.verification_level)) return null;
  return {
    instruments: row.profiles.instruments,
    isPrimary: row.is_primary,
    joinedAt: row.joined_at,
    level: row.profiles.level,
    name: row.profiles.name,
    photoUrl: row.profiles.photo_url || null,
    profileId: row.profile_id,
    role: row.role,
    roleLabel: row.role_label || null,
    verificationLevel: row.verification_level,
  };
}

export async function fetchSchoolsPage(
  page: number,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<MusicSchool>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('music_schools')
    .select(schoolColumns)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize) as SchoolRow[];
  return {
    items: rows.map(mapSchool),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function fetchSchool(
  schoolId: string,
  signal?: AbortSignal,
): Promise<MusicSchool | null> {
  const query = getSupabaseClient()
    .from('music_schools')
    .select(schoolColumns)
    .eq('id', schoolId)
    .eq('is_active', true);
  const abortable = signal ? query.abortSignal(signal) : query;
  const result = await abortable.maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapSchool(result.data as SchoolRow) : null;
}

export async function fetchMySchoolAffiliations(
  signal?: AbortSignal,
): Promise<SchoolAffiliation[]> {
  const query = getSupabaseClient().rpc('my_music_schools');
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  return result.data.flatMap((row) => {
    const affiliation = mapMyAffiliation(row);
    return affiliation ? [affiliation] : [];
  });
}

export async function fetchSchoolMembersPage(
  schoolId: string,
  page: number,
  pageSize = 30,
  signal?: AbortSignal,
): Promise<Page<SchoolMember>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('music_school_memberships')
    .select(
      'profile_id,role,role_label,verification_level,is_primary,joined_at,profiles!inner(name,photo_url,instruments,level)',
    )
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .order('name', { ascending: true, referencedTable: 'profiles' })
    .order('profile_id', { ascending: true })
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = (result.data as unknown as SchoolMemberRow[]).slice(0, pageSize);
  return {
    items: rows.flatMap((row) => {
      const member = mapMember(row);
      return member ? [member] : [];
    }),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function saveSchoolAffiliation(
  input: NormalizedSchoolAffiliationInput,
): Promise<void> {
  const params: Database['public']['Functions']['join_music_school']['Args'] = {
    p_role: input.role,
    p_school_id: input.schoolId,
    p_visibility: input.visibility,
    ...(input.roleLabel ? { p_role_label: input.roleLabel } : {}),
  };
  const result = await getSupabaseClient().rpc('join_music_school', params);
  if (result.error) throw result.error;
}

export async function leaveSchool(schoolId: string): Promise<boolean> {
  const result = await getSupabaseClient().rpc('leave_music_school', { p_school_id: schoolId });
  if (result.error) throw result.error;
  return result.data;
}
