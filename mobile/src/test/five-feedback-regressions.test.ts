import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const source = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('cinq retours terrain ciblés', () => {
  it('force le thème et le contraste des sélecteurs date/heure natifs', () => {
    const field = source('src/components/ui/native-date-time-field.tsx');
    expect(field.match(/themeVariant=\{dark \? 'dark' : 'light'\}/g)).toHaveLength(2);
    expect(field.match(/textColor=\{disabled \? palette\.muted : palette\.text\}/g)).toHaveLength(
      2,
    );
    expect(field).toContain('accessibilityState={{ disabled }}');
  });

  it('gère plusieurs créneaux facultatifs sans réutiliser availability_places', () => {
    const repository = source('src/features/profiles/profile-edit-repository.ts');
    const screen = source('src/features/profiles/profile-availability-screen.tsx');
    expect(repository).toContain('available_dates,availability_time_slots');
    expect(repository).not.toContain('availability_places');
    expect(screen).toContain("t('Ajouter un créneau')");
    expect(screen).toContain('removeAvailableDay(availability, date)');
  });

  it('alimente le filtre écoles depuis l’annuaire actif et stocke les identifiants', () => {
    const filter = source('src/features/discovery/filter-screen.tsx');
    const model = source('src/features/discovery/discovery-model.ts');
    expect(filter).toContain('useSchoolDirectory()');
    expect(filter).toContain('schoolIds: toggle(filters.schoolIds, school.id)');
    expect(model).toContain(
      'profile.schools.some((school) => filters.schoolIds.includes(school.id))',
    );
  });

  it('découple Mes SOS du flux public et invalide les deux caches', () => {
    const repository = source('src/features/gigs/gig-repository.ts');
    const screen = source('src/app/(tabs)/sos.tsx');
    const queries = source('src/features/gigs/gig-queries.ts');
    const realtime = source('src/features/gigs/gig-realtime.ts');
    expect(repository).toContain(".from('gig_requests')");
    expect(repository).toContain(".eq('host_id', hostingUserId)");
    expect(screen).toContain('useHostedGigs()');
    expect(screen).toContain('hostedQuery.data?.pages.flatMap');
    expect(queries).toContain('gigKeys.hosted(userId)');
    expect(realtime).toContain('gigKeys.hosted(userId)');
  });

  it('rend lecture, modification et suppression vidéo explicites et tactiles', () => {
    const portfolio = source('src/features/portfolio/portfolio-screen.tsx');
    expect(portfolio).toContain("t('Lire la vidéo')");
    expect(portfolio).toContain("t('Modifier')");
    expect(portfolio).toContain("Alert.alert(t('Supprimer cette vidéo ?')");
    expect(portfolio).toContain('minHeight: 48');
  });
});
