import { describe, expect, it } from '@jest/globals';

import {
  normalizeEditableProfile,
  stringRecord,
  toggleProfileValue,
  type EditableProfile,
} from '@/features/profiles/profile-edit-model';

const draft: EditableProfile = {
  bio: '  Pianiste jazz  ',
  city: '  Genève  ',
  country: 'ch',
  genres: ['Jazz', 'Jazz'],
  instrumentLevels: { Basse: 'Débutant', Piano: 'Professionnel' },
  instruments: ['Piano', 'Basse'],
  name: '  Élodie   Martin  ',
  photoUrl: null,
  postalCode: ' 1201 ',
  socials: {
    instagram: 'https://instagram.com/@elodie.music/',
    tiktok: '   ',
    x: '@elodie',
  },
};

describe('édition du profil', () => {
  it('normalise toutes les valeurs sans jamais inclure Premium ou des coordonnées', () => {
    expect(normalizeEditableProfile(draft)).toEqual({
      bio: 'Pianiste jazz',
      city: 'Genève',
      country: 'CH',
      genres: ['Jazz'],
      instrument_levels: { Basse: 'Débutant', Piano: 'Professionnel' },
      instruments: ['Piano', 'Basse'],
      level: 'Professionnel',
      name: 'Élodie Martin',
      neighborhood: '1201 Genève',
      postal_code: '1201',
      socials: { instagram: 'elodie.music', x: 'elodie' },
    });
  });

  it('refuse un profil incomplet et supprime le niveau d’un instrument retiré au modèle', () => {
    expect(() => normalizeEditableProfile({ ...draft, instruments: [] })).toThrow(
      'profile_required_fields_missing',
    );
    expect(toggleProfileValue(['Piano', 'Basse'], 'Piano')).toEqual(['Basse']);
    expect(toggleProfileValue(['Piano'], 'Basse')).toEqual(['Piano', 'Basse']);
  });

  it('ne conserve que les propriétés JSON texte', () => {
    expect(stringRecord({ instagram: 'elodie', nested: { hidden: true }, count: 2 })).toEqual({
      instagram: 'elodie',
    });
  });
});
