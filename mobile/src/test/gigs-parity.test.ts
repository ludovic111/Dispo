import { describe, expect, it, jest } from '@jest/globals';

import { mergeNativeDateTimePart } from '@/components/ui/native-date-time-field';
import {
  applicationDecisionParams,
  combineGigDate,
  createGigWritePlan,
  directResponseParams,
  gigsForScope,
  gigViewerAction,
  matchProfilesToGig,
  resolveGigLocation,
  triageHostedGigs,
  unslottedGigApplicants,
  type GigCreateInput,
  type GigDetail,
  type GigMatchProfile,
  type GigSummary,
} from '@/features/gigs/gig-model';
import {
  countUnopenedCompatibleGigs,
  openedGigsStorageKey,
  shouldFetchNextSosBadgePage,
  SOS_BADGE_MAX_PAGES,
  SOS_BADGE_PAGE_SIZE,
} from '@/features/gigs/gig-opened-store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const now = new Date('2026-09-01T10:00:00+02:00');

const validCreate: GigCreateInput = {
  city: ' Genève ',
  countryCode: ' ch ',
  date: '2026-09-12T18:30:00+02:00',
  description: '  Balance à 18 h  ',
  exactAddress: '  Rue privée 12, entrée B  ',
  feeAmount: '180',
  feeMode: 'amount',
  genre: 'Jazz',
  hostId: 'host-1',
  paymentMethod: 'twint',
  postalCode: ' 1201 ',
  publicPlace: '  AMR  ',
  targetId: null,
  title: '  Cherche bassiste  ',
  wantedInstruments: ['Basse', 'Basse', 'Contrebasse'],
  wantedLevels: ['Avancé'],
};

function gig(overrides: Partial<GigSummary> = {}): GigSummary {
  return {
    date: '2026-09-12T18:30:00+02:00',
    description: 'Deux sets',
    eventId: null,
    fee: 180,
    filledInstruments: [],
    genre: 'Jazz',
    groupId: null,
    hostId: 'host-1',
    hostName: 'Hôte',
    hostPhotoUrl: null,
    id: 'gig-1',
    isFresh: true,
    isLocked: false,
    neighborhood: '1201 Genève · CH',
    paymentMethod: 'twint',
    place: 'AMR',
    postedAt: '2026-09-01T12:00:00Z',
    targetId: null,
    targetStatus: null,
    title: 'Cherche bassiste',
    wantedInstruments: ['Basse'],
    wantedLevels: [],
    ...overrides,
  };
}

function detail(overrides: Partial<GigDetail> = {}): GigDetail {
  return {
    ...gig(),
    applicants: [],
    location: {
      city: null,
      countryCode: null,
      exactAddress: null,
      latitude: null,
      longitude: null,
      postalCode: null,
      state: 'restricted',
    },
    myApplication: null,
    ...overrides,
  };
}

describe('formulaire SOS structuré et confidentialité', () => {
  it("sépare totalement la ligne publique de l'adresse exacte privée", () => {
    const plan = createGigWritePlan(validCreate, now);
    expect(plan.insert).toEqual({
      date: new Date(validCreate.date).toISOString(),
      description: 'Balance à 18 h',
      event_id: null,
      fee: 180,
      genre: 'Jazz',
      group_id: null,
      host_id: 'host-1',
      neighborhood: '1201 Genève · CH',
      payment_method: 'twint',
      place: 'AMR',
      public_location_label: 'AMR',
      target_id: null,
      target_status: null,
      title: 'Cherche bassiste',
      wanted_instruments: ['Basse', 'Contrebasse'],
      wanted_levels: ['Avancé'],
    });
    expect(JSON.stringify(plan.insert)).not.toContain('Rue privée');
    expect(plan.location).toEqual({
      city: 'Genève',
      countryCode: 'CH',
      exactAddress: 'Rue privée 12, entrée B',
      latitude: null,
      longitude: null,
      postalCode: '1201',
      publicLocationLabel: 'AMR',
    });
  });

  it('encode une demande directe et les trois modes de cachet', () => {
    const direct = createGigWritePlan(
      { ...validCreate, feeMode: 'none', targetId: 'target-1' },
      now,
    );
    expect(direct.insert.target_status).toBe('pending');
    expect(direct.insert.target_id).toBe('target-1');
    expect(direct.insert.fee).toBe(0);
    expect(direct.insert.payment_method).toBeNull();
    expect(
      createGigWritePlan({ ...validCreate, feeMode: 'negotiable' }, now).insert.fee,
    ).toBeNull();
    expect(
      createGigWritePlan({ ...validCreate, paymentMethod: 'Revolut' }, now).insert.payment_method,
    ).toBe('Revolut');
    expect(
      createGigWritePlan({ ...validCreate, paymentMethod: 'PayPal', targetId: 'target-1' }, now)
        .insert.payment_method,
    ).toBe('PayPal');
  });

  it('conserve le lien groupe/événement d’un SOS prérempli', () => {
    const plan = createGigWritePlan(
      { ...validCreate, eventId: 'event-1', groupId: 'group-1' },
      now,
    );
    expect(plan.insert).toMatchObject({ event_id: 'event-1', group_id: 'group-1' });
  });

  it('combine une date locale sans accepter les débordements du calendrier', () => {
    expect(new Date(combineGigDate('2026-09-12', '20:30')).getTime()).toBeGreaterThan(0);
    expect(() => combineGigDate('2026-02-30', '20:30')).toThrow('gig_date_invalid');
    expect(() => combineGigDate('2026-09-12', '25:00')).toThrow('gig_date_invalid');
    const current = new Date(2026, 8, 12, 20, 30);
    const changedDay = mergeNativeDateTimePart(current, new Date(2026, 9, 4, 12, 0), 'date');
    expect([
      changedDay.getFullYear(),
      changedDay.getMonth(),
      changedDay.getDate(),
      changedDay.getHours(),
      changedDay.getMinutes(),
    ]).toEqual([2026, 9, 4, 20, 30]);
    const changedTime = mergeNativeDateTimePart(current, new Date(2026, 0, 1, 18, 45), 'time');
    expect([
      changedTime.getFullYear(),
      changedTime.getMonth(),
      changedTime.getDate(),
      changedTime.getHours(),
      changedTime.getMinutes(),
    ]).toEqual([2026, 8, 12, 18, 45]);
  });

  it('distingue adresse absente, interdite, disponible et erreur RPC', () => {
    expect(resolveGigLocation(null).state).toBe('restricted');
    expect(resolveGigLocation(null, true).state).toBe('unknown');
    expect(
      resolveGigLocation({
        city: 'Genève',
        country_code: 'CH',
        exact_address: ' ',
        latitude: null,
        longitude: null,
        postal_code: '1201',
      }).state,
    ).toBe('absent');
    expect(
      resolveGigLocation({
        city: 'Genève',
        country_code: 'CH',
        exact_address: 'Rue 1',
        latitude: 46.2,
        longitude: 6.1,
        postal_code: '1201',
      }),
    ).toMatchObject({ exactAddress: 'Rue 1', state: 'available' });
  });
});

describe('filtre SOS école de musique', () => {
  const matching = gig({ hostSchoolIds: ['school-amr'], id: 'matching' });
  const schoolOnly = gig({ hostSchoolIds: ['school-ema'], id: 'school' });
  const outside = gig({ hostSchoolIds: ['school-other'], id: 'outside' });
  const gigs = [matching, schoolOnly, outside];

  it('garde les trois portées indépendantes et respecte les affiliations visibles', () => {
    expect(
      gigsForScope(gigs, [matching], 'matching', ['school-ema']).map((item) => item.id),
    ).toEqual(['matching']);
    expect(gigsForScope(gigs, [matching], 'school', ['school-ema']).map((item) => item.id)).toEqual(
      ['school'],
    );
    expect(gigsForScope(gigs, [matching], 'all', ['school-ema']).map((item) => item.id)).toEqual([
      'matching',
      'school',
      'outside',
    ]);
  });

  it("renvoie une liste vide tant que l'utilisateur n'a pas d'école", () => {
    expect(gigsForScope(gigs, [matching], 'school', [])).toEqual([]);
  });
});

describe('états de candidature et décisions serveur', () => {
  const application = {
    createdAt: '2026-09-01T12:00:00Z',
    id: 'application-1',
    instrument: 'Basse',
    message: '',
    musicianId: 'viewer-1',
    musicianName: 'Viewer',
    musicianPhotoUrl: null,
    status: 'pending' as const,
  };

  it('couvre organisateur, demande directe, candidature et annonce complète', () => {
    expect(gigViewerAction(detail(), 'host-1')).toBe('organizer');
    expect(
      gigViewerAction(detail({ targetId: 'viewer-1', targetStatus: 'pending' }), 'viewer-1'),
    ).toBe('direct-pending');
    expect(
      gigViewerAction(detail({ targetId: 'viewer-1', targetStatus: 'accepted' }), 'viewer-1'),
    ).toBe('direct-accepted');
    expect(
      gigViewerAction(detail({ targetId: 'viewer-1', targetStatus: 'declined' }), 'viewer-1'),
    ).toBe('direct-declined');
    expect(gigViewerAction(detail({ myApplication: application }), 'viewer-1')).toBe(
      'application-pending',
    );
    expect(
      gigViewerAction(
        detail({ myApplication: { ...application, status: 'accepted' } }),
        'viewer-1',
      ),
    ).toBe('application-accepted');
    expect(
      gigViewerAction(
        detail({ myApplication: { ...application, status: 'declined' } }),
        'viewer-1',
      ),
    ).toBe('application-declined');
    expect(gigViewerAction(detail({ filledInstruments: ['Basse'] }), 'viewer-1')).toBe('filled');
  });

  it('n’invente aucun nom ni paramètre pour les RPC existantes', () => {
    expect(applicationDecisionParams('application-1')).toEqual({
      application_id: 'application-1',
    });
    expect(directResponseParams('gig-1', true)).toEqual({ p_accept: true, p_gig: 'gig-1' });
  });

  it('garde les candidatures historiques sans poste dans le groupe Autre', () => {
    const legacy = { ...application, id: 'legacy', instrument: null };
    const unknown = { ...application, id: 'unknown', instrument: 'Theremin' };
    expect(
      unslottedGigApplicants(
        detail({ applicants: [application, legacy, unknown], wantedInstruments: ['Basse'] }),
      ).map((candidate) => candidate.id),
    ).toEqual(['legacy', 'unknown']);
  });
});

describe('triage Mes SOS', () => {
  it('place les décisions hôte en premier et sépare les demandes directes envoyées', () => {
    const result = triageHostedGigs([
      gig({ date: '2026-09-02T18:00:00Z', id: 'quiet', pendingApplicantCount: 0 }),
      gig({ date: '2026-09-10T18:00:00Z', id: 'todo', pendingApplicantCount: 2 }),
      gig({ id: 'direct-done', targetId: 'target-1', targetStatus: 'accepted' }),
      gig({ id: 'direct-pending', targetId: 'target-2', targetStatus: 'pending' }),
    ]);
    expect(result.hosted.map((item) => item.id)).toEqual(['todo', 'quiet']);
    expect(result.pendingApplicantCount).toBe(2);
    expect(result.sentDirect.map((item) => item.id)).toEqual(['direct-pending', 'direct-done']);
  });
});

describe('matching après publication', () => {
  const profile = (overrides: Partial<GigMatchProfile> = {}): GigMatchProfile => ({
    availableDates: ['2026-09-12'],
    genres: ['Jazz'],
    id: 'profile-1',
    instruments: ['Basse'],
    level: 'Avancé',
    name: 'Zoé',
    photoUrl: null,
    relationRank: 0,
    ...overrides,
  });

  it('écarte les profils sans instrument ou sans disponibilité future', () => {
    const result = matchProfilesToGig(
      gig(),
      [
        profile(),
        profile({ id: 'wrong-instrument', instruments: ['Piano'] }),
        profile({ availableDates: [], id: 'unavailable' }),
      ],
      now,
    );
    expect(result.map((match) => match.id)).toEqual(['profile-1']);
  });

  it('classe date confirmée, genre puis relation comme le client natif', () => {
    const result = matchProfilesToGig(
      gig(),
      [
        profile({ availableDates: ['2026-09-20'], id: 'friend', relationRank: 40 }),
        profile({ genres: ['Rock / Pop'], id: 'confirmed-rock', name: 'A' }),
        profile({ id: 'confirmed-jazz', name: 'B' }),
      ],
      now,
    );
    expect(result.map((match) => match.id)).toEqual(['confirmed-jazz', 'confirmed-rock', 'friend']);
  });
});

describe('puce locale des nouveaux SOS', () => {
  const viewer = {
    id: 'viewer-1',
    instrumentLevels: { Basse: 'Avancé' },
    instruments: ['Basse'],
    level: 'Intermédiaire',
  };

  it('isole les ouvertures par compte', () => {
    expect(openedGigsStorageKey('viewer-1')).not.toBe(openedGigsStorageKey('viewer-2'));
    expect(openedGigsStorageKey('viewer-1')).toContain('viewer-1');
  });

  it('borne explicitement le scan serveur à 500 annonces actives', () => {
    expect(SOS_BADGE_PAGE_SIZE * SOS_BADGE_MAX_PAGES).toBe(500);
    expect(shouldFetchNextSosBadgePage(4, 5)).toBe(true);
    expect(shouldFetchNextSosBadgePage(5, 6)).toBe(false);
    expect(shouldFetchNextSosBadgePage(1, null)).toBe(false);
  });

  it('compte seulement les SOS externes futurs compatibles, ouverts et non ciblés', () => {
    const eligible = gig({ id: 'eligible', wantedLevels: ['Avancé'] });
    const duplicate = { ...eligible };
    const values = [
      eligible,
      duplicate,
      gig({ hostId: 'viewer-1', id: 'mine' }),
      gig({ date: '2026-08-31T20:00:00+02:00', id: 'past' }),
      gig({ id: 'direct', targetId: 'viewer-1', targetStatus: 'pending' }),
      gig({ id: 'wrong-instrument', wantedInstruments: ['Piano'] }),
      gig({ id: 'wrong-level', wantedLevels: ['Débutant'] }),
      gig({ id: 'opened' }),
      gig({ filledInstruments: ['Basse'], id: 'filled' }),
    ];
    expect(countUnopenedCompatibleGigs(values, viewer, new Set(['opened']), now)).toBe(1);
  });
});
