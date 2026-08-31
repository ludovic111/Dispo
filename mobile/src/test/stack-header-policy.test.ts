import { describe, expect, it } from '@jest/globals';

import {
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
  ])('keeps %s on its single custom header', (route) => {
    expect(isHeaderlessStackRoute(route)).toBe(true);
  });

  it.each(['settings', 'profile/availability', 'notification-center'])(
    'hides the native header for %s before the route renders',
    (route) => {
      expect(isHeaderlessStackRoute(route)).toBe(true);
      expect(headerlessModalStackRoutes).toContain(route);
    },
  );

  it('keeps the SOS presentation while using only custom headers', () => {
    expect(headerlessModalStackRoutes).toContain('gigs/create');
    expect(headerlessStackRoutes).toEqual(expect.arrayContaining(['gigs/matches', 'gigs/request']));
  });

  it('keeps whats-new as a gesture-locked custom-header modal', () => {
    expect(lockedHeaderlessModalStackRoutes).toContain('whats-new');
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
