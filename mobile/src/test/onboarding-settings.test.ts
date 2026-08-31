import { describe, expect, it } from '@jest/globals';

import {
  canCompleteOnboarding,
  normalizeOnboardingDraft,
  toggleInstrument,
  type OnboardingDraft,
} from '@/features/onboarding/onboarding-model';
import { patchNotes } from '@/features/settings/patch-notes-data';
import {
  normalizeMarketingVersion,
  normalizeProfileRegion,
  notificationStatusLabel,
  privacyPage,
  setPushCategory,
  supportPage,
  whatsNewDecision,
} from '@/features/settings/settings-model';

const completeDraft: OnboardingDraft = {
  city: 'Genève',
  country: 'CH',
  instruments: ['Piano'],
  level: 'Intermédiaire',
  name: 'Ludo',
  postalCode: '1201',
};

describe('onboarding parity rules', () => {
  it('requires the same four live-profile fields as SwiftUI', () => {
    expect(canCompleteOnboarding(completeDraft)).toBe(true);
    expect(canCompleteOnboarding({ ...completeDraft, name: ' ' })).toBe(false);
    expect(canCompleteOnboarding({ ...completeDraft, instruments: [] })).toBe(false);
    expect(canCompleteOnboarding({ ...completeDraft, city: 'G' })).toBe(false);
    expect(canCompleteOnboarding({ ...completeDraft, postalCode: '12' })).toBe(false);
  });

  it('trims, uppercases and deduplicates before saving', () => {
    expect(
      normalizeOnboardingDraft({
        ...completeDraft,
        city: '  Genève ',
        country: ' ch ',
        instruments: ['Voix', 'Piano', 'Voix'],
        name: '  Ludo ',
        postalCode: '  1201a ',
      }),
    ).toEqual({
      ...completeDraft,
      city: 'Genève',
      country: 'CH',
      instruments: ['Piano', 'Voix'],
      name: 'Ludo',
      postalCode: '1201A',
    });
  });

  it('toggles instruments without duplicates', () => {
    expect(toggleInstrument(['Piano'], 'Voix')).toEqual(['Piano', 'Voix']);
    expect(toggleInstrument(['Piano', 'Voix'], 'Piano')).toEqual(['Voix']);
  });
});

describe('settings parity helpers', () => {
  it('maps the notification states shown by the native screen', () => {
    expect(notificationStatusLabel('denied', true)).toBe('Bloquées dans Réglages');
    expect(notificationStatusLabel('granted', false)).toBe('Désactivées');
    expect(notificationStatusLabel('granted', true)).toBe('Actives');
    expect(notificationStatusLabel('provisional', true)).toBe('Livraison discrète');
    expect(notificationStatusLabel('ephemeral', true)).toBe('Temporaires');
  });

  it('updates one push category without mutating the others', () => {
    expect(setPushCategory({ groups: true, messages: true, sos: true }, 'messages', false)).toEqual(
      { groups: true, messages: false, sos: true },
    );
  });

  it('normalise la région native et refuse une adresse incomplète', () => {
    expect(
      normalizeProfileRegion({
        city: '  La  Chaux-de-Fonds ',
        country: ' ch ',
        postalCode: ' 2300 ',
      }),
    ).toEqual({ city: 'La Chaux-de-Fonds', country: 'CH', postalCode: '2300' });
    expect(() => normalizeProfileRegion({ city: 'G', country: 'CH', postalCode: '12' })).toThrow(
      'profile_region_incomplete',
    );
  });

  it('keeps the canonical support and privacy routes', () => {
    expect(supportPage('fr')).toBe('https://dispoapp.net/support-fr');
    expect(supportPage('en')).toBe('https://dispoapp.net/support-en');
    expect(privacyPage('fr')).toBe('https://dispoapp.net/privacy');
    expect(privacyPage('de')).toBe('https://dispoapp.net/privacy-en');
  });

  it('marks the current Swift patch-note version', () => {
    expect(normalizeMarketingVersion('2.4.0')).toBe('2.4');
    expect(patchNotes).toHaveLength(31);
    expect(patchNotes[0]?.version).toBe('2.4');
    expect(patchNotes.at(-1)?.version).toBe('0.1.0');
  });
});

describe('nouveautés après mise à jour', () => {
  it("ne coupe pas le premier lancement et ne s'affiche qu'après une mise à jour", () => {
    expect(whatsNewDecision(null, '2.4')).toBe('first-install');
    expect(whatsNewDecision('2.4', '2.4')).toBe('current');
    expect(whatsNewDecision('2.3', '2.4')).toBe('updated');
  });
});
