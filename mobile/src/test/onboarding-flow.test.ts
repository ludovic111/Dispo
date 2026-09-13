import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { shortProfileLevel } from '@/domain/profile';
import { GIG_INSTRUMENT_GROUPS } from '@/features/gigs/gig-model';
import {
  clearOnboardingProgress,
  loadOnboardingProgress,
  parseOnboardingProgress,
  saveOnboardingProgress,
} from '@/features/onboarding/onboarding-draft-storage';
import {
  canCompleteOnboarding,
  emptyOnboardingDraft,
  firstBlockingStepIndex,
  globalLevel,
  instrumentCategories,
  mergeResumedDraft,
  normalizeInstrument,
  normalizeInstrumentLevels,
  normalizeInstruments,
  normalizeOnboardingDraft,
  onboardingConcepts,
  onboardingStepIssue,
  onboardingSteps,
  resumeStepIndex,
  setDraftInstrumentLevel,
  sortSchoolsForOnboarding,
  toggleDraftInstrument,
  type OnboardingDraft,
} from '@/features/onboarding/onboarding-model';
import { onboardingDraftFromProfile } from '@/features/onboarding/onboarding-service';
import {
  normalizeEditableProfile,
  withCurrentInstruments,
} from '@/features/profiles/profile-edit-model';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const complete: OnboardingDraft = {
  ...emptyOnboardingDraft,
  city: 'Genève',
  instrumentLevels: { Piano: 'Avancé', Voix: 'Débutant' },
  instruments: ['Piano', 'Voix'],
  name: 'Ludo',
  postalCode: '1201',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('saxophone : un seul instrument par variante', () => {
  it('retire le saxophone générique de tous les sélecteurs', () => {
    const onboarding = instrumentCategories.flatMap((category) => category.instruments);
    const gig = GIG_INSTRUMENT_GROUPS.flatMap((group) => group.values);
    for (const list of [onboarding, gig]) {
      expect(list).not.toContain('Saxophone');
      expect(list).toContain('Saxophone alto');
      expect(list).toContain('Saxophone ténor');
    }
  });

  it('ramène la valeur héritée vers l’alto sans toucher aux autres instruments', () => {
    expect(normalizeInstrument('Saxophone')).toBe('Saxophone alto');
    expect(normalizeInstrument('  Saxophone ')).toBe('Saxophone alto');
    expect(normalizeInstrument('Saxophone ténor')).toBe('Saxophone ténor');
    expect(normalizeInstruments(['Saxophone', 'Piano', 'Saxophone alto', 'Piano'])).toEqual([
      'Saxophone alto',
      'Piano',
    ]);
  });

  it('renomme la clé de niveau en gardant la valeur alto déjà présente', () => {
    expect(
      normalizeInstrumentLevels(
        { Saxophone: 'Débutant', 'Saxophone alto': 'Professionnel', Piano: 'Avancé' },
        ['Saxophone', 'Saxophone alto', 'Piano'],
      ),
    ).toEqual({ Piano: 'Avancé', 'Saxophone alto': 'Professionnel' });
    expect(
      normalizeInstrumentLevels({ Saxophone: 'Avancé', Basse: 'bidon' }, ['Saxophone', 'Basse']),
    ).toEqual({
      'Saxophone alto': 'Avancé',
    });
    expect(normalizeInstrumentLevels({ Piano: 'Avancé' }, ['Voix'])).toEqual({});
  });

  it('présélectionne l’alto quand un profil hérité arrive dans l’onboarding ou l’édition', () => {
    const draft = onboardingDraftFromProfile({
      city: 'Genève',
      country: 'CH',
      genres: ['Jazz'],
      instrument_levels: { Saxophone: 'Avancé' },
      instruments: ['Saxophone'],
      level: 'Avancé',
      name: 'Sax',
      photo_url: null,
      postal_code: '1201',
    });
    expect(draft.instruments).toEqual(['Saxophone alto']);
    expect(draft.instrumentLevels).toEqual({ 'Saxophone alto': 'Avancé' });

    const editable = withCurrentInstruments({
      bio: '',
      city: 'Genève',
      country: 'CH',
      genres: [],
      instrumentLevels: { Saxophone: 'Avancé' },
      instruments: ['Saxophone', 'Piano'],
      name: 'Sax',
      photoUrl: null,
      postalCode: '1201',
      socials: {},
    });
    expect(editable.instruments).toEqual(['Saxophone alto', 'Piano']);
    expect(editable.instrumentLevels).toEqual({ 'Saxophone alto': 'Avancé' });
    expect(normalizeEditableProfile(editable).instruments).toEqual(['Saxophone alto', 'Piano']);
  });
});

describe('niveaux courts', () => {
  it('abrège en lisible et en compact, sans changer les valeurs inconnues', () => {
    expect(
      ['Débutant', 'Intermédiaire', 'Avancé', 'Professionnel'].map((l) => shortProfileLevel(l)),
    ).toEqual(['Déb.', 'Inter.', 'Av.', 'Pro']);
    expect(shortProfileLevel('Avancé', true)).toBe('Av.');
    expect(shortProfileLevel('Ancien', true)).toBe('Ancien');
  });
});

describe('brouillon d’onboarding', () => {
  it('bascule un instrument avec un niveau par défaut et calcule le niveau global au maximum', () => {
    const added = toggleDraftInstrument(emptyOnboardingDraft, 'Piano');
    expect(added).toEqual({ instrumentLevels: { Piano: 'Intermédiaire' }, instruments: ['Piano'] });
    const levels = setDraftInstrumentLevel(added, 'Piano', 'Professionnel');
    expect(globalLevel({ ...levels, Voix: 'Débutant' })).toBe('Professionnel');
    expect(globalLevel({})).toBe('Intermédiaire');
    const removed = toggleDraftInstrument({ ...emptyOnboardingDraft, ...added }, 'Piano');
    expect(removed).toEqual({ instrumentLevels: {}, instruments: [] });
  });

  it('normalise le brouillon et dérive le niveau global des instruments', () => {
    const value = normalizeOnboardingDraft({
      ...complete,
      genres: [' Jazz', 'Jazz', ''],
      instrumentLevels: { Piano: 'Avancé', Voix: 'Débutant', Basse: 'Professionnel' },
      instruments: ['Voix', 'Piano'],
      level: 'Débutant',
      name: '  Ludo   Marie ',
      photoUrl: '  ',
    });
    expect(value.instruments).toEqual(['Piano', 'Voix']);
    expect(value.instrumentLevels).toEqual({ Piano: 'Avancé', Voix: 'Débutant' });
    expect(value.level).toBe('Avancé');
    expect(value.genres).toEqual(['Jazz']);
    expect(value.name).toBe('Ludo Marie');
    expect(value.photoUrl).toBeNull();
  });

  it('considère complet un profil existant sans les nouvelles étapes facultatives', () => {
    expect(canCompleteOnboarding(complete)).toBe(true);
    expect(
      canCompleteOnboarding({
        city: 'Genève',
        instruments: ['Saxophone'],
        name: 'Ludo',
        postalCode: '1201',
      }),
    ).toBe(true);
    expect(canCompleteOnboarding({ ...complete, instruments: [] })).toBe(false);
    expect(canCompleteOnboarding({ ...complete, name: 'L' })).toBe(false);
  });

  it('bloque uniquement les étapes lieu, identité et instruments', () => {
    expect(onboardingStepIssue('place', emptyOnboardingDraft)).toBe('place_incomplete');
    expect(onboardingStepIssue('identity', emptyOnboardingDraft)).toBe('name_too_short');
    expect(onboardingStepIssue('instruments', emptyOnboardingDraft)).toBe('instruments_required');
    for (const step of [
      'language',
      'concepts',
      'styles',
      'school',
      'notifications',
      'plan',
    ] as const) {
      expect(onboardingStepIssue(step, emptyOnboardingDraft)).toBeNull();
    }
    expect(onboardingSteps).toHaveLength(9);
    expect(onboardingConcepts).toHaveLength(3);
  });

  it('reprend au plus tard à la première étape bloquante', () => {
    expect(firstBlockingStepIndex(emptyOnboardingDraft)).toBe(onboardingSteps.indexOf('place'));
    expect(firstBlockingStepIndex(complete)).toBe(onboardingSteps.length - 1);
    expect(resumeStepIndex(7, emptyOnboardingDraft)).toBe(onboardingSteps.indexOf('place'));
    expect(resumeStepIndex(7, complete)).toBe(7);
    expect(resumeStepIndex(-3, complete)).toBe(0);
    expect(resumeStepIndex(99, complete)).toBe(onboardingSteps.length - 1);
  });

  it('fusionne le brouillon local par-dessus le profil serveur', () => {
    const server: OnboardingDraft = {
      ...emptyOnboardingDraft,
      city: 'Lausanne',
      instruments: ['Basse'],
      instrumentLevels: { Basse: 'Avancé' },
      name: 'Serveur',
      photoUrl: 'https://cdn/avatar.jpg',
      postalCode: '1000',
    };
    const stored: OnboardingDraft = { ...emptyOnboardingDraft, genres: ['Jazz'], name: 'Local' };
    const merged = mergeResumedDraft(server, stored);
    expect(merged.name).toBe('Local');
    expect(merged.city).toBe('Lausanne');
    expect(merged.instruments).toEqual(['Basse']);
    expect(merged.genres).toEqual(['Jazz']);
    expect(merged.photoUrl).toBe('https://cdn/avatar.jpg');
    expect(merged.level).toBe('Avancé');
  });
});

describe('persistance locale du parcours', () => {
  it('survit à une app tuée et ignore un brouillon d’un autre compte ou corrompu', async () => {
    await saveOnboardingProgress({
      draft: complete,
      schoolId: 'school-1',
      schoolRole: 'teacher',
      step: 4,
      userId: 'user-a',
    });
    const resumed = await loadOnboardingProgress('user-a');
    expect(resumed?.step).toBe(4);
    expect(resumed?.schoolId).toBe('school-1');
    expect(resumed?.schoolRole).toBe('teacher');
    expect(resumed?.draft.instruments).toEqual(['Piano', 'Voix']);
    await expect(loadOnboardingProgress('user-b')).resolves.toBeNull();
    expect(parseOnboardingProgress('{not json', 'user-a')).toBeNull();
    expect(parseOnboardingProgress(JSON.stringify({ userId: 'user-a' }), 'user-a')).toBeNull();
    const loose = parseOnboardingProgress(
      JSON.stringify({
        draft: {
          instruments: ['Saxophone', 3],
          instrumentLevels: { Saxophone: 'Avancé', Piano: 'x' },
        },
        schoolRole: 'staff',
        step: 42,
        userId: 'user-a',
      }),
      'user-a',
    );
    expect(loose?.draft.instruments).toEqual(['Saxophone alto']);
    expect(loose?.draft.instrumentLevels).toEqual({ 'Saxophone alto': 'Avancé' });
    expect(loose?.schoolRole).toBe('student');
    expect(loose?.step).toBe(onboardingSteps.length - 1);
    await clearOnboardingProgress();
    await expect(loadOnboardingProgress('user-a')).resolves.toBeNull();
  });
});

describe('écoles dans l’onboarding', () => {
  it('place l’AMR en premier puis trie par nom', () => {
    const sorted = sortSchoolsForOnboarding([
      { name: 'EPI Genève', shortName: 'EPI', slug: 'epi-geneve' },
      { name: 'Zeta', shortName: null, slug: 'zeta' },
      { name: 'AMR Genève', shortName: 'AMR', slug: 'amr-geneve' },
      { name: 'École des Musiques Actuelles', shortName: 'EMA', slug: 'ema-geneve' },
    ]);
    expect(sorted.map((school) => school.slug)).toEqual([
      'amr-geneve',
      'ema-geneve',
      'epi-geneve',
      'zeta',
    ]);
  });
});
