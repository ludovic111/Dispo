import { describe, expect, it, jest } from '@jest/globals';

import { normalizedLegacyPreferences } from '@/services/storage/legacy-native-preferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('legacy native preference migration', () => {
  it('keeps valid Swift choices and defaults missing push categories to enabled', () => {
    expect(
      normalizedLegacyPreferences({
        groupLastSeen: {
          'group-1': '2026-08-31T18:00:00.000Z',
          invalid: 'not-a-date',
        },
        groupLastSeenByProfile: {
          'profile-a': {
            'group-2': '2026-08-31T17:00:00.000Z',
            invalid: 'not-a-date',
          },
          '': { ignored: '2026-08-31T17:00:00.000Z' },
        },
        language: 'fr',
        notificationsEnabled: false,
        openedGigIds: ['gig-2', 'gig-1', 'gig-2', ''],
        pushGroups: null,
        pushMessages: true,
        pushSos: false,
        schoolLastSeen: {
          'school-1': '2026-08-31T19:00:00.000Z',
          invalid: 'not-a-date',
        },
        sosShowAll: true,
        theme: 'system',
      }),
    ).toEqual({
      groupLastSeen: { 'group-1': '2026-08-31T18:00:00.000Z' },
      groupLastSeenByProfile: {
        'profile-a': { 'group-2': '2026-08-31T17:00:00.000Z' },
      },
      language: 'fr',
      notificationsEnabled: false,
      openedGigIds: ['gig-1', 'gig-2'],
      pushPreferences: { groups: true, messages: true, sos: false },
      schoolLastSeen: { 'school-1': '2026-08-31T19:00:00.000Z' },
      sosShowAll: true,
      theme: 'system',
    });
  });

  it('rejects unsupported locale and theme values', () => {
    const value = normalizedLegacyPreferences({
      groupLastSeen: null,
      groupLastSeenByProfile: null,
      language: 'xx',
      notificationsEnabled: null,
      openedGigIds: null,
      pushGroups: null,
      pushMessages: null,
      pushSos: null,
      schoolLastSeen: null,
      sosShowAll: null,
      theme: 'purple',
    });

    expect(value.language).toBeNull();
    expect(value.theme).toBeNull();
    expect(value.notificationsEnabled).toBeNull();
  });
});
