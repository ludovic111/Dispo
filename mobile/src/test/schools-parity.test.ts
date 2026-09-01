import { describe, expect, it } from '@jest/globals';

import {
  affiliationStatusLabel,
  buildSchoolMessageTimeline,
  filterSchools,
  isValidSchoolMessage,
  latestSchoolMessage,
  mergeSchoolMessagesNewestFirst,
  normalizeSchoolAffiliationInput,
  schoolDisplayName,
  schoolErrorMessage,
  schoolInitials,
  sortSchools,
  type MusicSchool,
  type SchoolMessage,
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

const ema: MusicSchool = {
  city: 'Genève',
  countryCode: 'CH',
  id: 'ema',
  isVerified: true,
  logoUrl: 'https://example.test/ema.png',
  name: 'École des Musiques Actuelles',
  shortName: 'EMA',
  slug: 'ema-geneve',
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
    expect(filterSchools([amr, ema, epi], 'ecole').map((school) => school.id)).toEqual(['ema']);
    expect(filterSchools([amr, ema, epi], 'ema').map((school) => school.id)).toEqual(['ema']);
    expect(filterSchools([amr, ema, epi], 'carouge').map((school) => school.id)).toEqual(['epi']);
  });

  it('place les affiliations actives avant le reste puis garde un ordre stable', () => {
    expect(sortSchools([ema, epi, amr], new Set(['ema'])).map((school) => school.id)).toEqual([
      'ema',
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

function schoolMessage(
  id: string,
  createdAt: string,
  overrides: Partial<SchoolMessage> = {},
): SchoolMessage {
  return {
    channelId: 'channel-1',
    createdAt,
    deletedAt: null,
    editedAt: null,
    id,
    senderId: 'member-1',
    senderName: 'Nina',
    senderPhotoUrl: null,
    text: `Message ${id}`,
    ...overrides,
  };
}

describe('communauté école', () => {
  it('applique exactement la limite serveur de 4000 caractères après trim', () => {
    expect(isValidSchoolMessage('   ')).toBe(false);
    expect(isValidSchoolMessage('x'.repeat(4_000))).toBe(true);
    expect(isValidSchoolMessage('x'.repeat(4_001))).toBe(false);
  });

  it('dédoublonne le realtime, garde le dernier état et trie le fil de façon stable', () => {
    const first = schoolMessage('a', '2026-08-31T10:00:00.000Z');
    const second = schoolMessage('b', '2026-08-31T10:01:00.000Z');
    const updated = { ...second, editedAt: '2026-08-31T10:02:00.000Z', text: 'Corrigé' };
    const merged = mergeSchoolMessagesNewestFirst([first, second, first], updated);
    expect(merged.map((message) => message.id)).toEqual(['b', 'a']);
    expect(merged[0]?.text).toBe('Corrigé');
    expect(latestSchoolMessage(merged)?.id).toBe('b');
  });

  it('insère un séparateur de jour compatible avec la liste inversée', () => {
    const timeline = buildSchoolMessageTimeline([
      schoolMessage('new', '2026-09-01T10:00:00.000Z'),
      schoolMessage('old', '2026-08-31T15:00:00.000Z'),
    ]);
    expect(timeline.map((item) => item.kind)).toEqual(['message', 'day', 'message', 'day']);
  });
});
