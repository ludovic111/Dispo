import { describe, expect, it } from '@jest/globals';

import { createGigPayload, gigApplicationPayload, type CreateGigInput } from '@/domain/gig';
import {
  relationTags,
  relationshipMatches,
  schoolLogoPresentation,
  type SchoolAffiliation,
} from '@/domain/profile';

const validGig: CreateGigInput = {
  date: '2026-09-12T18:30:00+02:00',
  description: '  Set de deux heures  ',
  fee: 180,
  genre: 'Jazz',
  hostId: 'host-1',
  place: '  AMR Genève  ',
  title: '  Cherche contrebassiste  ',
  wantedInstruments: ['Contrebasse', 'Contrebasse', 'Basse'],
};

function school(overrides: Partial<SchoolAffiliation> = {}): SchoolAffiliation {
  return {
    id: 'school-1',
    logoUrl: null,
    name: 'Association pour l’encouragement de la Musique improvisée',
    shortName: 'AMR',
    slug: 'amr',
    ...overrides,
  };
}

describe('création et candidature à un SOS', () => {
  it('normalise le payload et déduplique les instruments demandés', () => {
    expect(createGigPayload(validGig)).toEqual({
      date: new Date(validGig.date).toISOString(),
      description: 'Set de deux heures',
      fee: 180,
      genre: 'Jazz',
      host_id: 'host-1',
      neighborhood: 'AMR Genève',
      place: 'AMR Genève',
      public_location_label: 'AMR Genève',
      title: 'Cherche contrebassiste',
      wanted_instruments: ['Contrebasse', 'Basse'],
    });
  });

  it('conserve un cachet nul et refuse les champs ou dates invalides', () => {
    expect(createGigPayload({ ...validGig, fee: null }).fee).toBeNull();
    expect(() => createGigPayload({ ...validGig, title: ' ' })).toThrow(
      'gig_required_fields_missing',
    );
    expect(() => createGigPayload({ ...validGig, date: 'pas-une-date' })).toThrow(
      'gig_date_invalid',
    );
  });

  it('construit une candidature minimale et nettoie ses champs texte', () => {
    expect(
      gigApplicationPayload('gig-1', 'musician-1', '  Batterie  ', '  Disponible !  '),
    ).toEqual({
      gig_id: 'gig-1',
      instrument: 'Batterie',
      message: 'Disponible !',
      musician_id: 'musician-1',
    });
    expect(() => gigApplicationPayload('', 'musician-1', 'Batterie', '')).toThrow(
      'gig_application_invalid',
    );
  });
});

describe('filtres Ami et Même école', () => {
  const friendAndClassmate = { isFriend: true, sharesSchool: true };
  const unknownMusician = { isFriend: false, sharesSchool: false };

  it('applique chaque filtre à son indicateur normalisé', () => {
    expect(relationshipMatches(friendAndClassmate, 'friend')).toBe(true);
    expect(relationshipMatches(unknownMusician, 'friend')).toBe(false);
    expect(relationshipMatches(friendAndClassmate, 'sameSchool')).toBe(true);
    expect(relationshipMatches(unknownMusician, 'sameSchool')).toBe(false);
    expect(relationshipMatches(unknownMusician, 'all')).toBe(true);
  });

  it('conserve deux tags distincts et place AMR immédiatement après Ami', () => {
    expect(relationTags({ isFriend: true, schools: [school()] })).toEqual(['Ami', 'AMR']);
    expect(
      relationTags({
        isFriend: false,
        schools: [school({ shortName: ' amr ', slug: 'autre-slug' })],
      }),
    ).toEqual(['AMR']);
  });
});

describe('logo d’école', () => {
  it('utilise uniquement une URL HTTPS comme image distante', () => {
    expect(schoolLogoPresentation(school({ logoUrl: 'https://amr-geneve.ch/logo.png' }))).toEqual({
      kind: 'image',
      uri: 'https://amr-geneve.ch/logo.png',
    });
  });

  it('retombe sur le sigle ou les initiales sans bloquer le profil', () => {
    expect(schoolLogoPresentation(school({ logoUrl: 'http://insecure.test/logo.png' }))).toEqual({
      initials: 'A',
      kind: 'fallback',
    });
    expect(
      schoolLogoPresentation(
        school({ logoUrl: null, name: 'Haute école de musique', shortName: null, slug: 'hem' }),
      ),
    ).toEqual({ initials: 'HÉD', kind: 'fallback' });
    expect(
      schoolLogoPresentation(
        school({ logoUrl: null, name: '   ', shortName: '', slug: 'unknown' }),
      ),
    ).toEqual({ initials: 'É', kind: 'fallback' });
  });
});
