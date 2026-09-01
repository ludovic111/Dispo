import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.name.endsWith('.tsx') ? [entryPath] : [];
  });
}

describe('sorties de navigation', () => {
  it('laisse le bouton Retour Android fermer chaque Modal React Native', () => {
    const sourceRoot = path.resolve(process.cwd(), 'src');
    const missing = sourceFiles(sourceRoot).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return [...source.matchAll(/<Modal\b[\s\S]*?>/g)]
        .filter(([openingTag]) => !openingTag.includes('onRequestClose='))
        .map(
          (match) =>
            `${path.relative(process.cwd(), file)}:${source.slice(0, match.index).split('\n').length}`,
        );
    });

    expect(missing).toEqual([]);
  });

  it('garde une fermeture visible sur les écrans sans barre native', () => {
    const whatsNew = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/settings/whats-new-screen.tsx'),
      'utf8',
    );
    const affiliation = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/schools/school-affiliation-screen.tsx'),
      'utf8',
    );
    const messageControls = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/messages/message-controls.tsx'),
      'utf8',
    );

    expect(whatsNew).toContain('icon="close"');
    expect(affiliation).toContain('styles.stateHeader');
    expect(messageControls).toContain('styles.closeButton');
  });
});
