import type { SubscriptionState } from './subscription-service';

export type SchoolGrantNotice =
  | { kind: 'active'; endsAt: string; schoolShortName: string }
  | { kind: 'upcoming'; endsAt: string; schoolShortName: string; startsAt: string }
  | null;

/** What the plans screen must say about a school Premium grant, if anything. */
export function schoolGrantNotice(
  state: Pick<
    SubscriptionState,
    'expiresAt' | 'schoolShortName' | 'source' | 'upcomingSchoolGrant'
  >,
): SchoolGrantNotice {
  if (state.source === 'school_grant' && state.schoolShortName && state.expiresAt)
    return { kind: 'active', endsAt: state.expiresAt, schoolShortName: state.schoolShortName };
  const upcoming = state.upcomingSchoolGrant;
  if (upcoming)
    return {
      kind: 'upcoming',
      endsAt: upcoming.endsAt,
      schoolShortName: upcoming.schoolShortName,
      startsAt: upcoming.startsAt,
    };
  return null;
}

export function formatGrantDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
}
