import { describe, expect, it } from '@jest/globals';

import {
  filterPresentationOptions,
  headerlessModalStackRoutes,
  headerlessStackRoutes,
  isHeaderlessStackRoute,
  lockedHeaderlessModalStackRoutes,
} from '@/features/navigation/stack-header-policy';

describe('root stack header policy', () => {
  it.each([
    'groups/index',
    'groups/new',
    'groups/[id]/index',
    'groups/[id]/members',
    'groups/[id]/settings',
    'groups/[id]/events/[eventId]',
    'groups/[id]/events/edit',
    'groups/[id]/events/new',
    'groups/[id]/songs/[songId]',
    'groups/[id]/songs/[songId]/copy',
    'schools/[id]/community',
  ])('lets %s use the native Stack header', (route) => {
    expect(isHeaderlessStackRoute(route)).toBe(false);
  });

  it.each(['account', 'notifications', 'settings', 'profile/availability', 'notification-center'])(
    'lets the modal route %s render one native header',
    (route) => {
      expect(isHeaderlessStackRoute(route)).toBe(false);
      expect(headerlessModalStackRoutes).not.toContain(route);
    },
  );

  it('keeps the SOS presentation while using only custom headers', () => {
    expect(headerlessModalStackRoutes).toContain('gigs/create');
    expect(headerlessStackRoutes).toEqual(expect.arrayContaining(['gigs/matches', 'gigs/request']));
  });

  it('keeps whats-new as a gesture-locked custom-header modal', () => {
    expect(lockedHeaderlessModalStackRoutes).toContain('whats-new');
  });

  it('uses native medium and large filter detents on iOS only', () => {
    expect(filterPresentationOptions('ios')).toMatchObject({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.5, 1],
      sheetInitialDetentIndex: 0,
    });
    expect(filterPresentationOptions('android')).toEqual({
      headerShown: false,
      presentation: 'modal',
    });
  });

  it('contains no duplicate route registrations', () => {
    const routes = [
      ...headerlessStackRoutes,
      ...headerlessModalStackRoutes,
      ...lockedHeaderlessModalStackRoutes,
    ];
    expect(new Set(routes).size).toBe(routes.length);
  });

  it.each(['profiles/[id]', 'gigs/[id]', 'messages/[id]', 'search'])(
    'keeps the native header policy for %s',
    (route) => {
      expect(isHeaderlessStackRoute(route)).toBe(false);
    },
  );
});
