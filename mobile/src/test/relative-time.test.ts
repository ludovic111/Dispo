import { describe, expect, it } from '@jest/globals';

import { formatRelativeTime } from '@/i18n/relative-time';

describe('dates relatives compatibles Hermes', () => {
  it('couvre les neuf langues sans Intl.RelativeTimeFormat', () => {
    expect(formatRelativeTime(-1, 'hour', 'en')).toBe('1 hour ago');
    expect(formatRelativeTime(-1, 'hour', 'fr')).toBe('il y a 1 heure');
    expect(formatRelativeTime(-2, 'minute', 'es')).toBe('hace 2 minutos');
    expect(formatRelativeTime(2, 'day', 'de')).toBe('in 2 Tage');
    expect(formatRelativeTime(-3, 'second', 'it')).toBe('3 secondi fa');
    expect(formatRelativeTime(4, 'minute', 'pt')).toBe('em 4 minutos');
    expect(formatRelativeTime(-5, 'minute', 'zh-Hans')).toBe('5分钟前');
    expect(formatRelativeTime(6, 'hour', 'ja')).toBe('6時間後');
    expect(formatRelativeTime(-7, 'day', 'ko')).toBe('7일 전');
  });

  it('conserve les libellés naturels autour du jour courant', () => {
    expect(formatRelativeTime(-1, 'day', 'fr')).toBe('hier');
    expect(formatRelativeTime(0, 'minute', 'fr')).toBe('maintenant');
    expect(formatRelativeTime(1, 'day', 'en')).toBe('tomorrow');
  });
});
