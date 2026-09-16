import { describe, expect, it } from '@jest/globals';

import {
  eligibleApplyInstruments,
  EMPTY_GIG_MATCH,
  gigErrorMessage,
  gigMatchChips,
  gigMatchReasonLabel,
  isGigErrorCode,
  parseGigCandidate,
  parseGigMatch,
  parseGigViewerMatch,
  sortGigsByMatch,
  topGigMatchReasons,
} from '@/features/gigs/gig-model';

const t = (key: string, options?: Record<string, unknown>) =>
  options
    ? key.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options[name] ?? ''))
    : key;

const serverMatch = {
  available_on_date: true,
  away: false,
  away_in: null,
  common_genres: ['Jazz', 'Funk'],
  common_songs: { count: 2, titles: ['Blue Bossa', 'So What'] },
  distance_km: 3,
  instruments: ['Basse'],
  level_ok: true,
  reasons: [
    'instrument:Basse',
    'level',
    'available',
    'time_slot',
    'genres:Jazz',
    'songs:2',
    'near',
    'friend',
  ],
  relation: 'mutual',
  school_ok: true,
  schools: ['AMR'],
  score: 100,
  time_slot_ok: true,
};

describe('lecture du match serveur', () => {
  it('convertit le JSON de private.gig_profile_match et tolère les champs absents', () => {
    const match = parseGigMatch(serverMatch);
    expect(match).toEqual({
      availableOnDate: true,
      away: false,
      awayIn: null,
      commonGenres: ['Jazz', 'Funk'],
      commonSongs: { count: 2, overlapPercent: null, titles: ['Blue Bossa', 'So What'] },
      distanceKm: 3,
      instruments: ['Basse'],
      levelOk: true,
      reasons: serverMatch.reasons,
      relation: 'mutual',
      schoolOk: true,
      schools: ['AMR'],
      score: 100,
      timeSlotOk: true,
    });
    expect(parseGigMatch(null)).toEqual(EMPTY_GIG_MATCH);
    expect(parseGigMatch({ score: 140, relation: 'weird' })).toMatchObject({
      relation: 'none',
      schoolOk: true,
      score: 100,
    });
  });

  it('lit un candidat et une annonce scorée, et rejette les lignes sans identité', () => {
    const candidate = parseGigCandidate({
      match: serverMatch,
      profile: {
        city: 'Genève',
        genres: ['Jazz'],
        id: 'p1',
        instruments: ['Basse'],
        is_premium: true,
        level: 'Avancé',
        name: 'Zoé',
        photo_url: null,
      },
    });
    expect(candidate?.profile).toMatchObject({ id: 'p1', isPremium: true, name: 'Zoé' });
    expect(candidate?.match.score).toBe(100);
    expect(parseGigCandidate({ match: serverMatch, profile: {} })).toBeNull();
    const viewerMatch = parseGigViewerMatch({
      gig: {
        date: '2026-09-20T18:00:00Z',
        host_id: 'host',
        id: 'g1',
        target_id: null,
        title: 'Trio',
      },
      match: serverMatch,
    });
    expect(viewerMatch).toMatchObject({
      gigId: 'g1',
      hostId: 'host',
      targetId: null,
      title: 'Trio',
    });
    expect(parseGigViewerMatch({ gig: { id: 'g1' } })).toBeNull();
  });
});

describe('puces de critères', () => {
  const base = { dateLabel: 'sam. 12 sept.', levelLabel: 'Av.', perspective: 'host' as const, t };

  it('liste instrument, niveau, date, créneau, école, styles, morceaux, distance et relation', () => {
    const chips = gigMatchChips(parseGigMatch(serverMatch), {
      ...base,
      levelWanted: true,
      schoolWanted: true,
    });
    expect(chips.map((chip) => `${chip.key}=${chip.label}:${chip.tone}`)).toEqual([
      'instrument:Basse=Basse:ok',
      'level=Av. ✓:ok',
      'available=Dispo le sam. 12 sept. ✓:ok',
      'time_slot=Créneau ✓:ok',
      'school=AMR ✓:ok',
      'genre:Jazz=Jazz:info',
      'genre:Funk=Funk:info',
      'songs=2 morceaux en commun:ok',
      'distance=3 km:ok',
      'relation=Ami·e:ok',
    ]);
  });

  it('signale niveau refusé, date non cochée, absence et école manquante', () => {
    const chips = gigMatchChips(
      parseGigMatch({
        away: true,
        away_in: 'Lisbonne',
        instruments: ['Basse'],
        level_ok: false,
        relation: 'follower',
        school_ok: false,
        score: 10,
      }),
      { ...base, levelWanted: true, schoolWanted: true },
    );
    expect(chips.map((chip) => `${chip.key}:${chip.tone}`)).toEqual([
      'instrument:Basse:ok',
      'level:warn',
      'available:warn',
      'away:warn',
      'school:warn',
      'relation:ok',
    ]);
    expect(chips.find((chip) => chip.key === 'away')?.label).toBe('Absent·e (Lisbonne)');
    expect(chips.find((chip) => chip.key === 'relation')?.label).toBe('Te suit');
  });

  it('inverse la relation du point de vue du musicien et garde le niveau informatif sans exigence', () => {
    const chips = gigMatchChips(parseGigMatch({ instruments: ['Basse'], relation: 'follower' }), {
      ...base,
      levelWanted: false,
      perspective: 'viewer',
      schoolWanted: false,
    });
    expect(chips.find((chip) => chip.key === 'level')).toMatchObject({
      label: 'Av.',
      tone: 'info',
    });
    expect(chips.find((chip) => chip.key === 'relation')?.label).toBe('Tu suis');
    expect(chips.some((chip) => chip.key === 'school')).toBe(false);
  });

  it('résume une carte du fil par ses deux meilleures raisons hors instrument', () => {
    const match = parseGigMatch(serverMatch);
    expect(topGigMatchReasons(match)).toEqual(['available', 'time_slot']);
    expect(
      topGigMatchReasons(parseGigMatch({ reasons: ['instrument:Basse', 'genres:Jazz', 'friend'] })),
    ).toEqual(['friend', 'genres:Jazz']);
    expect(gigMatchReasonLabel('songs:1', t)).toBe('1 morceau en commun');
    expect(gigMatchReasonLabel('genres:Funk', t)).toBe('Funk');
    expect(gigMatchReasonLabel('near', t)).toBe('Tout près');
  });
});

describe('tri, éligibilité et erreurs serveur', () => {
  it('trie les annonces compatibles par score puis par date, les autres à la fin', () => {
    const gigs = [
      { date: '2026-09-20T10:00:00Z', id: 'later-high' },
      { date: '2026-09-10T10:00:00Z', id: 'unscored' },
      { date: '2026-09-12T10:00:00Z', id: 'low' },
      { date: '2026-09-11T10:00:00Z', id: 'early-high' },
    ];
    const scores = new Map([
      ['later-high', 90],
      ['early-high', 90],
      ['low', 30],
    ]);
    expect(sortGigsByMatch(gigs, scores).map((gig) => gig.id)).toEqual([
      'early-high',
      'later-high',
      'low',
      'unscored',
    ]);
  });

  it('ne propose que les postes ouverts joués au niveau demandé', () => {
    const viewer = {
      instrumentLevels: { Basse: 'Avancé' },
      instruments: ['Basse', 'Batterie', 'Piano'],
      level: 'Débutant',
    };
    const gig = {
      filledInstruments: ['Piano'],
      wantedInstruments: ['Basse', 'Batterie', 'Piano', 'Voix'],
      wantedLevels: ['Avancé', 'Professionnel'],
    };
    expect(eligibleApplyInstruments(gig, viewer)).toEqual(['Basse']);
    expect(eligibleApplyInstruments({ ...gig, wantedLevels: [] }, viewer)).toEqual([
      'Basse',
      'Batterie',
    ]);
  });

  it('traduit les codes serveur en copie française et garde le repli sinon', () => {
    expect(gigErrorMessage({ message: 'level_not_wanted' }, 'repli')).toBe(
      'Le niveau demandé pour ce poste ne correspond pas au tien.',
    );
    expect(gigErrorMessage({ message: 'already_contacted' }, 'repli')).toBe(
      'Tu as déjà contacté cette personne pour ce SOS.',
    );
    expect(gigErrorMessage(new Error('direct_request_pending'), 'repli')).toBe(
      'Tu as déjà une demande en attente auprès de cette personne.',
    );
    expect(gigErrorMessage({ message: 'random' }, 'repli')).toBe('repli');
    expect(gigErrorMessage(undefined, 'repli')).toBe('repli');
    expect(isGigErrorCode({ message: 'direct_request_pending' }, 'direct_request_pending')).toBe(
      true,
    );
    expect(isGigErrorCode({ message: 'blocked' }, 'direct_request_pending')).toBe(false);
  });
});

it('preserves unavailable overlap separately from a real zero', () => {
  expect(parseGigMatch({ common_songs: { count: null, overlap_percent: null, titles: [] } }).commonSongs).toEqual({ count: null, overlapPercent: null, titles: [] });
  expect(parseGigMatch({ common_songs: { count: 0, overlap_percent: 0, titles: [] } }).commonSongs).toEqual({ count: 0, overlapPercent: 0, titles: [] });
});
