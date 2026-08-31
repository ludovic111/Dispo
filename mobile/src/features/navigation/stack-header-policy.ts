export const headerlessStackRoutes = [
  'onboarding',
  'gigs/matches',
  'gigs/request',
  'groups/index',
  'groups/new',
  'groups/[id]/index',
  'groups/[id]/members',
  'groups/[id]/settings',
  'groups/[id]/events/[eventId]',
  'groups/[id]/events/edit',
  'groups/[id]/events/new',
  'groups/[id]/songs/[songId]',
  'profile/portfolio/index',
] as const;

export const headerlessModalStackRoutes = [
  'account',
  'filters',
  'gigs/create',
  'notification-center',
  'notifications',
  'patch-notes',
  'premium',
  'profile/availability',
  'profile/demos',
  'profile/edit',
  'profile/travel',
  'schools/[id]/join',
  'settings',
] as const;

export const lockedHeaderlessModalStackRoutes = [
  'groups/[id]/songs/[songId]/copy',
  'whats-new',
] as const;

export function isHeaderlessStackRoute(route: string): boolean {
  return [
    ...headerlessStackRoutes,
    ...headerlessModalStackRoutes,
    ...lockedHeaderlessModalStackRoutes,
  ].some((candidate) => candidate === route);
}
