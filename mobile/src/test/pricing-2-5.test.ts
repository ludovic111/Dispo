import { describe, expect, it, jest } from '@jest/globals';

import {
  groupCreationErrorKind,
  groupCreationErrorMessage,
} from '@/features/groups/group-creation-model';
import { DEMO_VIDEO_MAX_DURATION_MS, demoVideoLimit } from '@/features/portfolio/portfolio-model';
import { formatGrantDate, schoolGrantNotice } from '@/features/premium/school-grant-model';
import { selectedWorkshopSchool } from '@/features/premium/workshop-groups';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

describe('2.5 pricing surfaces', () => {
  it('caps demo videos at 1 min 30 for every tier and keeps 1/6 counts', () => {
    expect(DEMO_VIDEO_MAX_DURATION_MS).toBe(90_000);
    expect(demoVideoLimit(false)).toBe(1);
    expect(demoVideoLimit(true)).toBe(6);
  });
  it('announces an AMR grant only when it applies to the member', () => {
    expect(
      schoolGrantNotice({
        expiresAt: '2027-01-31T22:59:59Z',
        schoolShortName: 'AMR',
        source: 'school_grant',
        upcomingSchoolGrant: null,
      }),
    ).toEqual({ kind: 'active', endsAt: '2027-01-31T22:59:59Z', schoolShortName: 'AMR' });
    expect(
      schoolGrantNotice({
        expiresAt: null,
        schoolShortName: null,
        source: 'none',
        upcomingSchoolGrant: {
          endsAt: '2027-01-31T22:59:59Z',
          schoolShortName: 'AMR',
          startsAt: '2026-09-30T22:00:00Z',
        },
      }),
    ).toMatchObject({ kind: 'upcoming', schoolShortName: 'AMR' });
    expect(
      schoolGrantNotice({
        expiresAt: '2027-01-01T00:00:00Z',
        schoolShortName: null,
        source: 'store',
        upcomingSchoolGrant: null,
      }),
    ).toBeNull();
    expect(formatGrantDate('2027-01-31T22:59:59Z', 'fr-CH')).toContain('2027');
    expect(formatGrantDate('not a date', 'fr-CH')).toBe('not a date');
  });
  it('only selects a workshop school the member is eligible for', () => {
    const schools = [{ freeWorkshopsUntil: '2028-12-31', schoolId: 'amr', schoolShortName: 'AMR' }];
    expect(selectedWorkshopSchool(schools, 'amr')?.schoolShortName).toBe('AMR');
    expect(selectedWorkshopSchool(schools, 'epi')).toBeNull();
    expect(selectedWorkshopSchool(schools, null)).toBeNull();
    expect(selectedWorkshopSchool([], 'amr')).toBeNull();
  });
  it('explains a refused workshop group separately from the paid quota', () => {
    const workshop = { code: '42501', message: 'school_workshop_not_available' };
    expect(groupCreationErrorKind(workshop)).toBe('workshop');
    expect(groupCreationErrorMessage(workshop)).toBe(
      "Ton école ne propose pas de groupe d'atelier gratuit pour le moment.",
    );
    expect(groupCreationErrorKind({ message: 'subscription_required_for_group' })).toBe('limit');
  });
});
