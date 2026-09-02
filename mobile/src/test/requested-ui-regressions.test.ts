import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { schoolAcronym, shortProfileLevel } from '@/domain/profile';
import {
  acquireGroupCreationLock,
  groupCreationDiagnostic,
  groupCreationErrorKind,
  groupCreationErrorMessage,
  releaseGroupCreationLock,
} from '@/features/groups/group-creation-model';
import { groupEventColor } from '@/features/groups/group-event-presentation';
import {
  isKnownMusicalKey,
  musicalKeyOptions,
  musicalKeysEqual,
} from '@/features/groups/group-song-key-model';
import { soloOrderMembers } from '@/features/groups/group-song-row-model';

const source = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('simplification Accueil et Messages', () => {
  it('retire les écoles de Messages et place un unique Nouveau dans l’en-tête Groupes', () => {
    const messages = source('src/app/(tabs)/messages.tsx');
    expect(messages).not.toContain('SchoolCommunityRow');
    expect(messages).not.toContain('useSchoolCommunities');
    expect(messages).not.toContain("t('Écoles')");
    expect(messages.match(/accessibilityLabel=\{t\('Nouveau groupe'\)\}/g)).toHaveLength(1);
    expect(messages.indexOf("{t('Groupes')}")).toBeLessThan(
      messages.indexOf("accessibilityLabel={t('Nouveau groupe')}"),
    );
  });

  it('exclut les écoles du badge Messages', () => {
    const queries = source('src/features/navigation/tab-badge-queries.ts');
    const model = source('src/features/navigation/tab-badge-model.ts');
    expect(queries).not.toContain('useSchoolUnreadState');
    expect(model).not.toContain('schoolUnread');
  });
});

describe('présentation des événements', () => {
  it('lie la date aux trois couleurs de type sans remplacement par le line-up', () => {
    const palette = { concert: '#concert', jam: '#jam', rehearsal: '#rehearsal' };
    expect(groupEventColor('Répétition', palette)).toBe(palette.rehearsal);
    expect(groupEventColor('Concert', palette)).toBe(palette.concert);
    expect(groupEventColor('Jam', palette)).toBe(palette.jam);
    expect(groupEventColor('Autre', palette)).toBeNull();
    const events = source('src/features/groups/group-events-tab.tsx');
    const sessions = source('src/features/sessions/session-cards.tsx');
    expect(events).toContain('groupEventColor(event.kind, palette)');
    expect(sessions).toContain("['Concert', 'Jam', 'Répétition'].includes(item.eventKind ?? '')");
    expect(sessions).toContain('const color = eventColor(item.eventKind, palette)');
  });
});

describe('morceaux', () => {
  it('conserve exactement l’ordre des solos et représente un membre retiré par null', () => {
    const first = {
      id: 'first',
      instruments: ['Piano'],
      isLeader: false,
      kind: 'permanent' as const,
      name: 'First',
      photoUrl: null,
      role: null,
    };
    const second = { ...first, id: 'second', name: 'Second' };
    expect(soloOrderMembers({ solos: ['second', 'missing', 'first'] }, [first, second])).toEqual([
      second,
      null,
      first,
    ]);
  });

  it('affiche le raccourci uniquement avec des solos et le masque en réorganisation', () => {
    const row = source('src/features/groups/group-song-row.tsx');
    const repertoire = source('src/features/groups/group-repertoire-tab.tsx');
    const event = source('src/features/groups/group-event-detail-screen.tsx');
    expect(row).toContain('showSoloAction && song.solos.length > 0');
    expect(row).toContain("t('Membre retiré')");
    expect(repertoire).toContain('showSoloAction={!reorderMode}');
    expect(event).toContain('showSoloAction={!reorderActive}');
  });

  it('propose 24 tonalités, reconnaît les équivalents et préserve les inconnues', () => {
    expect(musicalKeyOptions).toHaveLength(24);
    expect(new Set(musicalKeyOptions).size).toBe(24);
    expect(musicalKeysEqual('Db', 'C♯')).toBe(true);
    expect(musicalKeysEqual('A#m', 'B♭m')).toBe(true);
    expect(musicalKeysEqual('G♭', 'F#')).toBe(true);
    expect(isKnownMusicalKey('mode historique')).toBe(false);
    const songScreen = source('src/features/groups/group-song-screen.tsx');
    expect(songScreen).not.toContain("placeholder={t('Bb, F#m…')}");
    expect(songScreen).toContain('!isKnownMusicalKey(draft.key)');
  });
});

describe('présentation des profils', () => {
  it('préfère le shortName puis génère un acronyme et ne modifie pas la valeur du niveau', () => {
    expect(schoolAcronym({ name: 'Haute école de musique de Genève', shortName: 'HEM' })).toBe(
      'HEM',
    );
    expect(schoolAcronym({ name: 'Haute école de musique de Genève', shortName: null })).toBe(
      'HÉMG',
    );
    const stored = 'Professionnel';
    expect(shortProfileLevel(stored)).toBe('Pro');
    expect(stored).toBe('Professionnel');
  });

  it('limite l’école à la propriété optionnelle de la tuile d’accueil', () => {
    const home = source('src/app/(tabs)/index.tsx');
    const row = source('src/features/discovery/discovery-profile-row.tsx');
    const search = source('src/features/discovery/search-screen.tsx');
    expect(home).toContain('primarySchool={item.schools[0] ?? null}');
    expect(row).toContain('primarySchool?: SchoolAffiliation | null');
    expect(row).toContain('accessibilityLabel={primarySchool.name}');
    expect(search).not.toContain('primarySchool=');
  });

  it('utilise le helper Pro dans tous les écrans de niveau court demandés', () => {
    const paths = [
      'src/features/discovery/discovery-profile-row.tsx',
      'src/features/discovery/filter-screen.tsx',
      'src/features/onboarding/onboarding-screen.tsx',
      'src/features/profiles/profile-connection-row.tsx',
      'src/features/profiles/profile-detail.tsx',
      'src/features/profiles/profile-edit-screen.tsx',
      'src/features/gigs/gig-form.tsx',
      'src/features/gigs/gig-detail.tsx',
      'src/app/gigs/matches.tsx',
    ];
    paths.forEach((file) => expect(source(file)).toContain('shortProfileLevel'));
  });
});

describe('calendrier des disponibilités', () => {
  it('synchronise le sélecteur natif avec les thèmes sombre et clair', () => {
    const availability = source('src/features/profiles/profile-availability-screen.tsx');
    expect(availability).toContain("themeVariant={dark ? 'dark' : 'light'}");
    expect(availability).toContain('accentColor={palette.electric}');
    expect(availability).toContain('textColor={palette.text}');
  });
});

describe('création de groupe', () => {
  it('distingue limite, session, réseau et erreur inconnue', () => {
    const limit = { message: 'premium_required_for_additional_group' };
    const auth = { code: 'PGRST301', message: 'JWT expired' };
    const network = new TypeError('Network request failed');
    expect(groupCreationErrorKind(limit)).toBe('limit');
    expect(groupCreationErrorKind(auth)).toBe('auth');
    expect(groupCreationErrorKind(network)).toBe('network');
    expect(groupCreationErrorKind({ code: '42501', message: 'RLS violation' })).toBe('unknown');
    expect(groupCreationErrorMessage(limit)).toContain('limite');
    expect(groupCreationErrorMessage(network)).toContain('réseau');
  });

  it('retire les secrets usuels du diagnostic de développement', () => {
    const diagnostic = groupCreationDiagnostic({
      code: '42501',
      details: 'user@example.com',
      hint: 'Bearer secret-value',
      message: 'safe',
    });
    expect(diagnostic).toEqual({
      code: '42501',
      details: '[redacted]',
      hint: '[redacted]',
      message: 'safe',
    });
  });

  it('bloque un second appui jusqu’à la fin de la requête', () => {
    const lock = { current: false };
    expect(acquireGroupCreationLock(lock)).toBe(true);
    expect(acquireGroupCreationLock(lock)).toBe(false);
    releaseGroupCreationLock(lock);
    expect(acquireGroupCreationLock(lock)).toBe(true);
  });

  it('conserve la navigation vers le groupe créé', () => {
    const screen = source('src/features/groups/group-new-screen.tsx');
    expect(screen).toContain('router.replace(`/groups/${groupId}` as never)');
    expect(screen).toContain('disabled={!name.trim() || memberIds.size === 0 || create.isPending}');
  });
});
