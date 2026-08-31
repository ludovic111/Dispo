export const headerlessStackRoutes = [
  'onboarding',
  'gigs/matches',
  'gigs/request',
  'profile/portfolio/index',
] as const;

export const headerlessModalStackRoutes = [
  'filters',
  'gigs/create',
  'patch-notes',
  'premium',
  'profile/demos',
  'profile/edit',
  'profile/travel',
  'schools/[id]/join',
] as const;

export const lockedHeaderlessModalStackRoutes = ['whats-new'] as const;

export function isHeaderlessStackRoute(route: string): boolean {
  return [
    ...headerlessStackRoutes,
    ...headerlessModalStackRoutes,
    ...lockedHeaderlessModalStackRoutes,
  ].some((candidate) => candidate === route);
}

export function filterPresentationOptions(platform: string) {
  if (platform === 'ios') {
    return {
      headerShown: false,
      presentation: 'formSheet' as const,
      sheetAllowedDetents: [0.5, 1],
      sheetGrabberVisible: true,
      sheetInitialDetentIndex: 0,
    };
  }
  return { headerShown: false, presentation: 'modal' as const };
}
