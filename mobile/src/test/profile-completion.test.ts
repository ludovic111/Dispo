import { describe, expect, it } from '@jest/globals';

import { shortProfileLevel } from '@/domain/profile';
import { profileCompletion } from '@/features/profiles/profile-completion';
import type { SchoolAffiliation } from '@/features/schools/school-model';

const profile: Parameters<typeof profileCompletion>[0] = {
  bio: 'Piano jazz',
  photoUrl: 'https://example.com/photo.jpg',
  instruments: ['Piano'],
  instrumentLevels: { Piano: 'Avancé' },
  level: 'Avancé',
  genres: ['Jazz'],
  demoVideos: [
    {
      id: 'demo',
      date: null,
      path: 'demo.mp4',
      thumbUrl: null,
      title: null,
      url: 'https://example.com/demo.mp4',
    },
  ],
  socials: { instagram: 'piano' },
};
const school = {
  status: 'active',
  verificationLevel: 'verified',
  school: { id: 'school' },
} as SchoolAffiliation;

describe('complétion du profil', () => {
  it('atteint 100 % uniquement avec les sept informations réelles', () => {
    expect(profileCompletion(profile, [school])).toEqual({ percent: 100, missing: [] });
  });
  it('ne valide pas une affiliation déclarée, quittée ou suspendue', () => {
    for (const affiliation of [
      { ...school, verificationLevel: 'self_declared' as const },
      { ...school, status: 'left' as const },
      { ...school, status: 'suspended' as const },
    ]) {
      const result = profileCompletion(profile, [affiliation]);
      expect(result.percent).toBe(86);
      expect(result.missing.map((step) => step.id)).toEqual(['school']);
    }
  });
  it('ignore les champs vides et les liens invalides et propose des actions utilisables', () => {
    const result = profileCompletion(
      { ...profile, bio: ' ', photoUrl: null, socials: { instagram: 'not a link' } },
      [school],
    );
    expect(result.percent).toBe(57);
    expect(result.missing.map((step) => step.id)).toEqual(['photo', 'bio', 'links']);
    expect(result.missing.every((step) => step.route === '/profile/edit')).toBe(true);
  });
  it('ouvre l’ajout de démo et conserve le niveau hérité des anciens profils', () => {
    const result = profileCompletion({ ...profile, instrumentLevels: {}, demoVideos: [] }, [
      school,
    ]);
    expect(result.missing.map((step) => step.id)).toEqual(['demos']);
    expect(result.missing[0]?.route).toBe('/profile/demos?add=1');
  });
});

describe('niveaux compacts de l’accueil', () => {
  it('abrège les quatre niveaux sans changer les valeurs conservées ni les autres écrans', () => {
    const levels = ['Débutant', 'Intermédiaire', 'Avancé', 'Professionnel'];
    expect(levels.map((level) => shortProfileLevel(level, true))).toEqual([
      'déb',
      'int',
      'av',
      'pro',
    ]);
    expect(levels.map((level) => shortProfileLevel(level))).toEqual([
      'Débutant',
      'Intermédiaire',
      'Avancé',
      'Pro',
    ]);
    expect(shortProfileLevel('Niveau historique', true)).toBe('Niveau historique');
  });
});
