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

  it('réserve le geste long aux poignées de réorganisation', () => {
    const row = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/groups/group-song-row.tsx'),
      'utf8',
    );

    expect(row).not.toContain('onLongPress');
    expect(row).toContain('name="chevron-forward"');
    expect(row).toContain('name="headset"');
  });
});
