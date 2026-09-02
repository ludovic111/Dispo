import { describe, expect, it } from '@jest/globals';

import { relationTags, socialRelationTags, type ProfileSummary } from '@/domain/profile';
import {
  activeFilterCount,
  availabilityPlaceForDate,
  boundedEditDistance,
  dateForAvailabilityScope,
  defaultDiscoveryFilters,
  distanceKm,
  matchesDiscoveryFilters,
  openingScope,
  profileAvailability,
  profileDistanceLabel,
  profileMatchesPlace,
  profilePlaceLabel,
  rankProfiles,
  searchDiscovery,
  searchTokens,
} from '@/features/discovery/discovery-model';
import type { GigSummary } from '@/features/gigs/gig-model';
import { messageTabBadgeCount, tabBadgeValue } from '@/features/navigation/tab-badge-model';
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

  it('indexe disponibilité, traductions, familles, alias complets et quartier SOS', () => {
    const now = new Date('2026-08-31T12:00:00');
    const translated = (value: string) => (value === 'Jazz manouche' ? 'Gypsy jazz' : value);
    const musician = profile({
      availableDates: ['2026-08-31'],
      genres: ['Jazz manouche', 'Salsa / Timba'],
      instruments: ['Violoncelle'],
    });
    expect(searchDiscovery('ce soir', [musician], [], { now }).profiles).toHaveLength(1);
    expect(
      searchDiscovery('gypsy', [musician], [], { now, translate: translated }).profiles,
    ).toHaveLength(1);
    expect(searchDiscovery('latin', [musician], [], { now }).profiles).toHaveLength(1);
    expect(searchDiscovery('celliste', [musician], [], { now }).profiles).toHaveLength(1);
    expect(
      searchDiscovery('paquis', [], [gig({ neighborhood: 'Pâquis', place: 'Genève' })]).gigs,
    ).toHaveLength(1);
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

  it('distingue une position exacte d’une position approximative', () => {
    const geneva = profile();
    const exact = profile({ hasExactLocation: true, latitude: 46.5197, longitude: 6.6323 });
    const approximate = profile({
      hasExactLocation: false,
      latitude: 46.5197,
      longitude: 6.6323,
    });
    expect(profileDistanceLabel(geneva, exact, 'fr-CH')).toMatch(/^5\d,\d km$/);
    expect(profileDistanceLabel(geneva, approximate, 'fr-CH')).toMatch(/^≈ 5\d km$/);
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
    expect(profilePlaceLabel(travelling)).toBe('1201 Genève CH');
    expect(profilePlaceLabel(travelling, '2026-09-14')).toBe('1100 Lisbonne PT');
    expect(availabilityPlaceForDate(travelling, '2026-09-14')?.id).toBe('trip-1');
    expect(availabilityPlaceForDate(travelling, '2026-09-25')).toBeNull();
  });

  it('conserve pays, code postal et ville séparés et exige chaque champ renseigné', () => {
    const filters = {
      ...defaultDiscoveryFilters,
      placeCity: 'Genève',
      placeCountry: 'CH',
      placePostalCode: '1201',
    };
    expect(activeFilterCount(filters)).toBe(1);
    expect(matchesDiscoveryFilters(profile(), filters, null)).toBe(true);
    expect(matchesDiscoveryFilters(profile({ postalCode: '1202' }), filters, null)).toBe(false);
    expect(matchesDiscoveryFilters(profile({ country: 'FR' }), filters, null)).toBe(false);
    expect(
      matchesDiscoveryFilters(
        profile({ city: 'Paris', country: 'FR', postalCode: '75011' }),
        { ...defaultDiscoveryFilters, placeCountry: 'FR' },
        null,
      ),
    ).toBe(true);
  });

  it('applique le filtre Bien notés à partir de quatre étoiles et trois avis', () => {
    const filters = { ...defaultDiscoveryFilters, wellRated: true };
    expect(matchesDiscoveryFilters(profile(), filters, null)).toBe(true);
    expect(matchesDiscoveryFilters(profile({ ratingAverage: 3.9 }), filters, null)).toBe(false);
    expect(matchesDiscoveryFilters(profile({ ratingCount: 2 }), filters, null)).toBe(false);
  });

  it('dérive les cinq états temporels et la date du scope', () => {
    const now = new Date('2026-08-31T12:00:00');
    expect(profileAvailability(profile({ availableDates: ['2026-08-31'] }), now).kind).toBe(
      'today',
    );
    expect(profileAvailability(profile({ availableDates: ['2026-09-02'] }), now).kind).toBe(
      'thisWeek',
    );
    expect(profileAvailability(profile({ availableDates: ['2026-09-05'] }), now).kind).toBe(
      'weekend',
    );
    expect(profileAvailability(profile({ availableDates: ['2026-09-09'] }), now).kind).toBe(
      'onRequest',
    );
    expect(profileAvailability(profile({ availableDates: [] }), now).kind).toBe('unavailable');
    expect(dateForAvailabilityScope('today', null, now)).toBe('2026-08-31');
    expect(dateForAvailabilityScope('weekend', null, now)).toBe('2026-09-05');
    expect(dateForAvailabilityScope('nearby', '2026-09-14', now)).toBe('2026-09-14');
  });

  it('classe relation, niveau, urgence puis distance comme Swift', () => {
    const now = new Date('2026-08-31T12:00:00');
    const me = profile({ id: 'me' });
    const friend = profile({ id: 'friend', isFriend: true, level: 'Débutant' });
    const pro = profile({ id: 'pro', level: 'Professionnel' });
    const availableToday = profile({
      availableDates: ['2026-08-31'],
      id: 'today',
      latitude: 46.4,
      level: 'Avancé',
    });
    const availableLater = profile({
      availableDates: ['2026-09-02'],
      id: 'later',
      latitude: 46.21,
      level: 'Avancé',
    });
    const nearby = profile({
      availableDates: ['2026-08-31'],
      id: 'nearby',
      latitude: 46.21,
      level: 'Avancé',
    });
    expect([pro, friend].sort((a, b) => rankProfiles(a, b, me, now))[0]?.id).toBe('friend');
    expect([availableLater, pro].sort((a, b) => rankProfiles(a, b, me, now))[0]?.id).toBe('pro');
    expect(
      [availableLater, availableToday].sort((a, b) => rankProfiles(a, b, me, now))[0]?.id,
    ).toBe('today');
    expect([availableToday, nearby].sort((a, b) => rankProfiles(a, b, me, now))[0]?.id).toBe(
      'nearby',
    );
  });

  it('ne répète pas l’école dans les relations sociales de la carte', () => {
    const musician = profile({
      playedWithFriend: true,
      relationship: 'following',
      schools: [
        {
          id: 'school-1',
          logoUrl: null,
          name: 'AMR Genève',
          shortName: 'AMR',
          slug: 'amr',
        },
      ],
      sharesSchool: true,
    });
    expect(relationTags(musician)).not.toContain('Même école');
    expect(socialRelationTags(musician)).toEqual(['Suivi', 'Relation commune']);
  });
});

describe('centre de notifications', () => {
  it('additionne les invitations en attente au badge Messages', () => {
    expect(messageTabBadgeCount(2, 3, 1)).toBe(6);
    expect(messageTabBadgeCount(0, 0, -1)).toBe(0);
    expect(tabBadgeValue(0)).toBeUndefined();
    expect(tabBadgeValue(7)).toBe('7');
    expect(tabBadgeValue(127)).toBe('99+');
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

    expect(
      notificationDestination({
        body: '',
        category: 'messages',
        createdAt: '',
        data: { school_id: 'school-7', target_tab: 'messages' },
        id: 'notification-4',
        readAt: null,
        title: 'Nouveau message dans la communauté',
      }),
    ).toBe('/schools/school-7/community');
  });
});
