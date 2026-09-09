import { profileSocialUrl, type ProfileSocialNetwork, type ProfileSummary } from '@/domain/profile';
import type { SchoolAffiliation } from '@/features/schools/school-model';

export function profileCompletion(
  profile: Pick<
    ProfileSummary,
    | 'photoUrl'
    | 'bio'
    | 'instruments'
    | 'instrumentLevels'
    | 'level'
    | 'genres'
    | 'demoVideos'
    | 'socials'
  >,
  schools: readonly SchoolAffiliation[],
) {
  const activeSchools = schools.filter((school) => school.status === 'active');
  const steps = [
    {
      id: 'photo',
      done: Boolean(profile.photoUrl),
      label: 'Ajouter une photo',
      route: '/profile/edit',
    },
    {
      id: 'bio',
      done: Boolean(profile.bio.trim()),
      label: 'Ajouter une bio',
      route: '/profile/edit',
    },
    {
      id: 'instruments',
      done: profile.instruments.some((instrument) =>
        Boolean(profile.instrumentLevels[instrument] || profile.level),
      ),
      label: 'Ajouter un instrument',
      route: '/profile/edit',
    },
    {
      id: 'styles',
      done: profile.genres.length > 0,
      label: 'Ajouter un style',
      route: '/profile/edit',
    },
    {
      id: 'demos',
      done: Boolean(profile.demoVideos?.length),
      label: 'Ajouter une démo',
      route: '/profile/demos?add=1',
    },
    {
      id: 'links',
      done: Object.entries(profile.socials ?? {}).some(([network, value]) =>
        profileSocialUrl(network as ProfileSocialNetwork, value),
      ),
      label: 'Ajouter un lien',
      route: '/profile/edit',
    },
    {
      id: 'school',
      done: activeSchools.some((school) => school.verificationLevel === 'verified'),
      label: activeSchools.length ? 'Vérifier l’école' : 'Ajouter une école',
      route: activeSchools[0] ? `/schools/${activeSchools[0].school.id}/join` : '/schools',
    },
  ];
  const missing = steps.filter((step) => !step.done);
  return { percent: Math.round(((steps.length - missing.length) / steps.length) * 100), missing };
}
