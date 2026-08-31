import { describe, expect, it } from '@jest/globals';

import type { ProfileSummary } from '@/domain/profile';
import {
  activeFilterCount,
  boundedEditDistance,
  defaultDiscoveryFilters,
  distanceKm,
  matchesDiscoveryFilters,
  openingScope,
  profileMatchesPlace,
  profilePlaceLabel,
  searchDiscovery,
  searchTokens,
} from '@/features/discovery/discovery-model';
import type { GigSummary } from '@/features/gigs/gig-model';
import { messageTabBadgeCount } from '@/features/navigation/tab-badge-model';
import {
  localizedNotificationText,
  notificationData,
  notificationDestination,
  normalizeNotificationCategory,
  relativeNotificationDate,
} from '@/features/notifications/notification-model';

function profile(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    availableDates: [],
    bio: '',
    city: 'Genève',
    collaborationCount: 0,
    country: 'CH',
    followerCount: 0,
    genres: ['Jazz'],
    id: 'profile-1',
    instrumentLevels: { Piano: 'Avancé' },
    instruments: ['Piano'],
    isFriend: false,
    isPremium: false,
    latitude: 46.2044,
    level: 'Avancé',
    longitude: 6.1432,
    name: 'Élodie Martin',
    photoUrl: null,
    playedWithFriend: false,
    postalCode: '1201',
    ratingAverage: 4.5,
    ratingCount: 4,
    relationship: 'none',
    schools: [],
    sharesSchool: false,
    ...overrides,
  };
}

function gig(overrides: Partial<GigSummary> = {}): GigSummary {
  return {
    date: '2026-09-12T18:30:00+02:00',
    description: 'Set salsa',
    eventId: null,
    fee: 180,
    filledInstruments: [],
    genre: 'Salsa / Timba',
    groupId: null,
    hostId: 'host-1',
    hostName: 'Marco Silva',
    hostPhotoUrl: null,
    id: 'gig-1',
    isLocked: false,
    neighborhood: 'Carouge',
    paymentMethod: 'twint',
    place: 'Carouge',
    postedAt: '2026-08-31T10:00:00Z',
    targetId: null,
    targetStatus: null,
    title: 'Cherche bassiste',
    wantedInstruments: ['Basse'],
    wantedLevels: ['Avancé'],
    ...overrides,
  };
}

describe('recherche universelle fidèle', () => {
  it('ignore les mots vides, accents et petites fautes', () => {
    expect(searchTokens('Je cherche une pianiste à Genève')).toEqual(['pianiste', 'geneve']);
    expect(boundedEditDistance('pianste', 'pianiste', 1)).toBe(1);
    expect(searchDiscovery('pianste geneve', [profile()], []).profiles).toHaveLength(1);
  });

  it('cherche aussi un SOS avec les alias d’instrument', () => {
    const results = searchDiscovery('bassiste Carouge', [], [gig()]);
    expect(results.gigs.map((item) => item.id)).toEqual(['gig-1']);
  });

  it('privilégie les correspondances complètes aux correspondances partielles', () => {
    const full = profile({ id: 'full', city: 'Carouge', name: 'Piano Club' });
    const partial = profile({ id: 'partial', city: 'Lausanne', name: 'Piano Libre' });
    expect(
      searchDiscovery('piano Carouge', [partial, full], []).profiles.map((item) => item.id),
    ).toEqual(['full']);
  });
});

describe('filtres de découverte', () => {
  it('additionne les familles de filtre sans compter chaque valeur', () => {
    expect(
      activeFilterCount({
        ...defaultDiscoveryFilters,
        friendsOnly: true,
        genres: ['Jazz', 'Funk'],
        instruments: ['Piano', 'Basse'],
        radiusKm: 50,
      }),
    ).toBe(4);
  });

  it('applique instrument ET style ET niveau et conserve une géoloc inconnue', () => {
    const filters = {
      ...defaultDiscoveryFilters,
      genres: ['Jazz'],
      instruments: ['Piano'],
      levels: ['Avancé'],
      radiusKm: 5,
    };
    expect(matchesDiscoveryFilters(profile(), filters, profile({ id: 'me' }))).toBe(true);
    expect(
      matchesDiscoveryFilters(
        profile({ latitude: null, longitude: null }),
        filters,
        profile({ id: 'me' }),
      ),
    ).toBe(true);
    expect(matchesDiscoveryFilters(profile({ genres: ['Metal'] }), filters, null)).toBe(false);
  });

  it('calcule une distance cohérente et choisit un créneau non vide', () => {
    const geneva = profile();
    const lausanne = profile({ latitude: 46.5197, longitude: 6.6323 });
    expect(distanceKm(geneva, lausanne)).toBeGreaterThan(45);
    expect(distanceKm(geneva, lausanne)).toBeLessThan(60);
    expect(openingScope([profile({ availableDates: [] })], new Date('2026-08-31T12:00:00'))).toBe(
      'nearby',
    );
  });

  it('cherche le lieu du séjour à la date demandée sans prétendre être au domicile', () => {
    const travelling = profile({
      availabilityPlaces: [
        {
          city: 'Lisbonne',
          country: 'PT',
          from: '2026-09-12',
          id: 'trip-1',
          postalCode: '1100',
          to: '2026-09-20',
        },
      ],
    });
    expect(profileMatchesPlace(travelling, 'Lisbonne', '2026-09-14')).toBe(true);
    expect(profileMatchesPlace(travelling, 'Genève', '2026-09-14')).toBe(false);
    expect(profileMatchesPlace(travelling, 'Genève', '2026-09-25')).toBe(true);
    expect(profilePlaceLabel(travelling, '2026-09-14')).toBe('1100 Lisbonne PT');
  });
});

describe('centre de notifications', () => {
  it('additionne les invitations en attente au badge Messages', () => {
    expect(messageTabBadgeCount(2, 3, 1)).toBe(6);
    expect(messageTabBadgeCount(0, 0, -1)).toBe(0);
  });

  it('normalise les catégories et rejette les données structurées inutiles', () => {
    expect(normalizeNotificationCategory('message')).toBe('messages');
    expect(normalizeNotificationCategory('autre')).toBe('unknown');
    expect(notificationData({ target_tab: 'sos', nested: { id: 'secret' }, count: 2 })).toEqual({
      count: '2',
      target_tab: 'sos',
    });
  });

  it('localise les libellés serveur connus sans modifier le contenu des utilisateurs', () => {
    const translate = ((key: string) => {
      if (key === '%@ te demande de dépanner') return '%@ asks you to fill in';
      return `translated:${key}`;
    }) as never;

    expect(localizedNotificationText('Nouveau SOS compatible', translate)).toBe(
      'translated:Nouveau SOS compatible',
    );
    expect(
      localizedNotificationText('Ludovic te demande de dépanner : Concert au Chat Noir', translate),
    ).toBe('Ludovic asks you to fill in : Concert au Chat Noir');
    expect(localizedNotificationText('Message libre du groupe', translate)).toBe(
      'Message libre du groupe',
    );
  });

  it('formate les dates relatives dans la langue active', () => {
    const now = new Date('2026-08-31T11:00:00.000Z');
    expect(relativeNotificationDate('2026-08-31T10:00:00.000Z', 'en', now)).toBe('1 hour ago');
    expect(relativeNotificationDate('2026-08-31T10:00:00.000Z', 'fr', now)).toBe('il y a 1 heure');
  });

  it('ouvre la destination précise quand son identifiant existe', () => {
    expect(
      notificationDestination({
        body: '',
        category: 'sos',
        createdAt: '',
        data: { gig_id: 'gig-42', target_tab: 'sos' },
        id: 'notification-1',
        readAt: null,
        title: '',
      }),
    ).toBe('/gigs/gig-42');

    expect(
      notificationDestination({
        body: '',
        category: 'groups',
        createdAt: '',
        data: { group_id: 'group-12', target_tab: 'messages' },
        id: 'notification-2',
        readAt: null,
        title: '',
      }),
    ).toBe('/groups/group-12');

    expect(
      notificationDestination({
        body: '',
        category: 'groups',
        createdAt: '',
        data: {
          group_id: 'group-12',
          source_table: 'group_invitations',
          target_tab: 'messages',
        },
        id: 'notification-3',
        readAt: null,
        title: '🎶 Invitation à un groupe',
      }),
    ).toBe('/(tabs)/messages?segment=groups');
  });
});
