import { describe, expect, it } from '@jest/globals';

import { profileHandle, profileSocialUrl } from '@/domain/profile';
import {
  canonicalCollaborationPair,
  canRateProfile,
  clampProfileRating,
} from '@/features/profiles/profile-social-model';

describe('profil social', () => {
  it('dérive le même identifiant stable que le profil Swift', () => {
    expect(profileHandle('Élodie  Martin')).toBe('@elodie.martin');
    expect(profileHandle('  李  ')).toBe('@李');
  });

  it('nettoie les pseudos sans ouvrir de lien non HTTPS', () => {
    expect(profileSocialUrl('instagram', '@dispo.app')).toBe('https://instagram.com/dispo.app');
    expect(profileSocialUrl('tiktok', 'https://tiktok.com/@ludo')).toBe('https://tiktok.com/@ludo');
    expect(profileSocialUrl('x', 'mauvais pseudo')).toBeNull();
  });

  it('canonise une collaboration sans dépendre du sens', () => {
    expect(canonicalCollaborationPair('b', 'a')).toEqual({ a_id: 'a', b_id: 'b' });
    expect(() => canonicalCollaborationPair('a', 'a')).toThrow('profile_collaboration_invalid');
  });

  it('réserve les étoiles aux pros ayant réellement joué ensemble', () => {
    expect(canRateProfile('Professionnel', true)).toBe(true);
    expect(canRateProfile('Professionnel', false)).toBe(false);
    expect(canRateProfile('Avancé', true)).toBe(false);
    expect(clampProfileRating(8)).toBe(5);
    expect(clampProfileRating(0)).toBe(1);
  });
});
