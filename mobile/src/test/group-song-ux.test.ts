import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

describe('fiche et tuile morceau', () => {
  it('ne rend plus la grille d’accords ni un éditeur technique iReal Pro', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/groups/group-song-screen.tsx'),
      'utf8',
    );

    expect(source).not.toContain("label={t('Grille d’accords')}");
    expect(source).not.toContain("label={t('Lien iReal Pro')}");
    expect(source).toContain("{t('Ouvrir dans iReal Pro')}");
  });

  it('rend les solos comme une liste numérotée et garde la copie explicite', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/groups/group-song-screen.tsx'),
      'utf8',
    );

    expect(source).toContain('styles.soloIndex');
    expect(source).toContain("t('Ajouter un solo')");
    expect(source).toContain("t('Copier le morceau')");
  });

  it('garde la tuile lisible et réserve les poignées à un mode de réorganisation', () => {
    const row = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/groups/group-song-row.tsx'),
      'utf8',
    );
    const repertoire = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/groups/group-repertoire-tab.tsx'),
      'utf8',
    );
    const event = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/groups/group-event-detail-screen.tsx'),
      'utf8',
    );

    expect(row).not.toContain('onLongPress');
    expect(row).toContain("metadata.join(' · ')");
    expect(row).toContain('name="chevron-forward"');
    expect(row).toContain('name="headset"');
    expect(repertoire).toContain('const [reorderMode, setReorderMode]');
    expect(repertoire).toContain('const reorderActive = reorderMode');
    expect(repertoire).toContain('<SongReorderList');
    expect(event).toContain('const [reorderMode, setReorderMode]');
    expect(event).toContain('const reorderActive = reorderMode');
    expect(event).toContain('<SongReorderList');
  });

  it('garde uniquement le raccourci permanent de création de groupe sur l’accueil', () => {
    const home = fs.readFileSync(path.resolve(process.cwd(), 'src/app/(tabs)/index.tsx'), 'utf8');

    expect(home).not.toContain("label={t('Mes disponibilités')}");
    expect(home).not.toContain("label={t('Écoles')}");
    expect(home).toContain("router.push('/groups/new'");
    expect(home).not.toContain('groups.length === 0 ? (');
  });
});
