import { describe, expect, it } from '@jest/globals';

import { textLinkSegments } from '@/domain/text-links';

describe('liens des chats et commentaires', () => {
  it('reconnaît les variantes YouTube avec paramètres, shorts et sans protocole', () => {
    for (const input of [
      'https://www.youtube.com/watch?v=abc&t=42s',
      'youtu.be/abc?t=42',
      'youtube.com/shorts/abc',
      'm.youtube.com/watch?v=abc',
      'music.youtube.com/watch?v=abc',
    ]) {
      const result = textLinkSegments(input);
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toMatch(/^https:\/\//);
      expect(result[0]?.text).toBe(input);
    }
  });
  it('conserve tout le texte, les retours à la ligne et la ponctuation entre plusieurs liens', () => {
    const input = 'Écoute (https://youtu.be/abc?t=2), puis\nwww.example.com/demo. Merci !';
    const result = textLinkSegments(input);
    expect(result.map((part) => part.text).join('')).toBe(input);
    expect(result.filter((part) => part.url).map((part) => part.url)).toEqual([
      'https://youtu.be/abc?t=2',
      'https://www.example.com/demo',
    ]);
  });
  it('préserve les parenthèses équilibrées dans les URLs', () => {
    expect(
      textLinkSegments('(https://example.com/wiki/Music_(jazz)).').find((part) => part.url)?.url,
    ).toBe('https://example.com/wiki/Music_(jazz)');
  });
  it('ne transforme pas les schémas applicatifs ou exécutables, les emails et les URLs invalides', () => {
    for (const input of [
      'javascript:alert(1)',
      'file:///private/test',
      'dispo://profile/1',
      'https://',
      'name@youtu.be/test',
      'https://name:password@example.com',
      'aucun lien ici',
    ]) {
      expect(textLinkSegments(input)).toEqual([{ text: input }]);
    }
  });
  it('normalise les liens web classiques et conserve leur libellé', () => {
    expect(textLinkSegments('HTTP://EXAMPLE.COM/music#part')).toEqual([
      { text: 'HTTP://EXAMPLE.COM/music#part', url: 'http://example.com/music#part' },
    ]);
  });
});
