import { describe, expect, it } from '@jest/globals';

import {
  affiliationStatusLabel,
  filterSchools,
  normalizeSchoolAffiliationInput,
  schoolDisplayName,
  schoolErrorMessage,
  schoolInitials,
  sortSchools,
  type MusicSchool,
} from '@/features/schools/school-model';

const amr: MusicSchool = {
  city: 'Genève',
  countryCode: 'CH',
  id: 'amr',
  isVerified: false,
  logoUrl: null,
  name: 'AMR Genève',
  shortName: 'AMR',
  slug: 'amr-geneve',
  websiteUrl: 'https://www.amr-geneve.ch/',
};

const hem: MusicSchool = {
  city: 'Genève',
  countryCode: 'CH',
  id: 'hem',
  isVerified: true,
  logoUrl: 'https://example.test/hem.png',
  name: 'Haute école de musique de Genève',
  shortName: 'HEM',
  slug: 'hem-geneve',
  websiteUrl: null,
};

const epi: MusicSchool = {
  city: 'Carouge',
  countryCode: 'CH',
  id: 'epi',
  isVerified: false,
  logoUrl: null,
  name: 'EPI Musique',
  shortName: null,
  slug: 'epi-geneve',
  websiteUrl: null,
};

describe('annuaire des écoles', () => {
  it('recherche par nom, nom court ou ville sans dépendre des accents', () => {
    expect(filterSchools([amr, hem, epi], 'ecole').map((school) => school.id)).toEqual(['hem']);
    expect(filterSchools([amr, hem, epi], 'hem').map((school) => school.id)).toEqual(['hem']);
    expect(filterSchools([amr, hem, epi], 'carouge').map((school) => school.id)).toEqual(['epi']);
  });

  it('place les affiliations actives avant le reste puis garde un ordre stable', () => {
    expect(sortSchools([hem, epi, amr], new Set(['hem'])).map((school) => school.id)).toEqual([
      'hem',
      'amr',
      'epi',
    ]);
  });

  it('reprend le nom court et le fallback visuel exact de la référence', () => {
    expect(schoolDisplayName(amr)).toBe('AMR');
    expect(schoolDisplayName(epi)).toBe('EPI Musique');
    expect(schoolInitials(epi)).toBe('EPI');
  });
});

describe('affiliation école', () => {
  it('ne présente jamais un rôle autodéclaré comme vérifié', () => {
    expect(
      affiliationStatusLabel({
        role: 'teacher',
        roleLabel: null,
        verificationLevel: 'self_declared',
      }),
    ).toBe('Professeur·e · déclaré');
    expect(
      affiliationStatusLabel({
        role: 'other',
        roleLabel: 'Intervenant jazz',
        verificationLevel: 'verified',
      }),
    ).toBe('Intervenant jazz');
  });

  it('normalise le rôle libre et ignore un texte libre pour les rôles connus', () => {
    expect(
      normalizeSchoolAffiliationInput('school', {
        role: 'other',
        roleLabel: '  Intervenant jazz  ',
        visibility: 'profile',
      }),
    ).toEqual({
      role: 'other',
      roleLabel: 'Intervenant jazz',
      schoolId: 'school',
      visibility: 'profile',
    });
    expect(
      normalizeSchoolAffiliationInput('school', {
        role: 'student',
        roleLabel: 'Texte obsolète',
        visibility: 'school_only',
      }).roleLabel,
    ).toBeNull();
  });

  it('refuse les rôles libres vides ou hors de la limite serveur', () => {
    expect(() =>
      normalizeSchoolAffiliationInput('school', {
        role: 'other',
        roleLabel: '  ',
        visibility: 'private',
      }),
    ).toThrow('school_role_label_required');
    expect(() =>
      normalizeSchoolAffiliationInput('school', {
        role: 'other',
        roleLabel: 'x'.repeat(81),
        visibility: 'private',
      }),
    ).toThrow('invalid_school_role_label');
  });

  it('traduit les refus métier sans masquer le fait que rien ne change', () => {
    expect(schoolErrorMessage(new Error('school_membership_limit_reached'))).toContain('cinq');
    expect(schoolErrorMessage(new Error('school_membership_suspended'))).toContain('suspendue');
    expect(schoolErrorMessage(new Error('network'))).toContain("Rien n'a été modifié");
  });
});
