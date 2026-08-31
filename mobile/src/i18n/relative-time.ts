export type RelativeTimeUnit = 'day' | 'hour' | 'minute' | 'second';
export type RelativeTimeStyle = 'long' | 'short';

type Language = 'de' | 'en' | 'es' | 'fr' | 'it' | 'ja' | 'ko' | 'pt' | 'zh';
type UnitLabels = Record<RelativeTimeUnit, readonly [one: string, many: string]>;

const supportedLanguages = new Set<Language>([
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'ko',
  'pt',
  'zh',
]);

const longUnits: Record<Language, UnitLabels> = {
  de: {
    day: ['Tag', 'Tage'],
    hour: ['Stunde', 'Stunden'],
    minute: ['Minute', 'Minuten'],
    second: ['Sekunde', 'Sekunden'],
  },
  en: {
    day: ['day', 'days'],
    hour: ['hour', 'hours'],
    minute: ['minute', 'minutes'],
    second: ['second', 'seconds'],
  },
  es: {
    day: ['día', 'días'],
    hour: ['hora', 'horas'],
    minute: ['minuto', 'minutos'],
    second: ['segundo', 'segundos'],
  },
  fr: {
    day: ['jour', 'jours'],
    hour: ['heure', 'heures'],
    minute: ['minute', 'minutes'],
    second: ['seconde', 'secondes'],
  },
  it: {
    day: ['giorno', 'giorni'],
    hour: ['ora', 'ore'],
    minute: ['minuto', 'minuti'],
    second: ['secondo', 'secondi'],
  },
  ja: { day: ['日', '日'], hour: ['時間', '時間'], minute: ['分', '分'], second: ['秒', '秒'] },
  ko: { day: ['일', '일'], hour: ['시간', '시간'], minute: ['분', '분'], second: ['초', '초'] },
  pt: {
    day: ['dia', 'dias'],
    hour: ['hora', 'horas'],
    minute: ['minuto', 'minutos'],
    second: ['segundo', 'segundos'],
  },
  zh: { day: ['天', '天'], hour: ['小时', '小时'], minute: ['分钟', '分钟'], second: ['秒', '秒'] },
};

const shortUnits: Record<Language, Record<RelativeTimeUnit, string>> = {
  de: { day: 'Tg.', hour: 'Std.', minute: 'Min.', second: 'Sek.' },
  en: { day: 'd', hour: 'hr', minute: 'min', second: 'sec' },
  es: { day: 'd', hour: 'h', minute: 'min', second: 's' },
  fr: { day: 'j', hour: 'h', minute: 'min', second: 's' },
  it: { day: 'g', hour: 'h', minute: 'min', second: 's' },
  ja: { day: '日', hour: '時間', minute: '分', second: '秒' },
  ko: { day: '일', hour: '시간', minute: '분', second: '초' },
  pt: { day: 'd', hour: 'h', minute: 'min', second: 's' },
  zh: { day: '天', hour: '小时', minute: '分钟', second: '秒' },
};

const special: Record<
  Language,
  { now: string; today: string; tomorrow: string; yesterday: string }
> = {
  de: { now: 'jetzt', today: 'heute', tomorrow: 'morgen', yesterday: 'gestern' },
  en: { now: 'now', today: 'today', tomorrow: 'tomorrow', yesterday: 'yesterday' },
  es: { now: 'ahora', today: 'hoy', tomorrow: 'mañana', yesterday: 'ayer' },
  fr: { now: 'maintenant', today: 'aujourd’hui', tomorrow: 'demain', yesterday: 'hier' },
  it: { now: 'ora', today: 'oggi', tomorrow: 'domani', yesterday: 'ieri' },
  ja: { now: '今', today: '今日', tomorrow: '明日', yesterday: '昨日' },
  ko: { now: '지금', today: '오늘', tomorrow: '내일', yesterday: '어제' },
  pt: { now: 'agora', today: 'hoje', tomorrow: 'amanhã', yesterday: 'ontem' },
  zh: { now: '现在', today: '今天', tomorrow: '明天', yesterday: '昨天' },
};

function languageFor(locale: string): Language {
  const candidate = locale.toLowerCase().split(/[-_]/)[0] as Language | undefined;
  return candidate && supportedLanguages.has(candidate) ? candidate : 'en';
}

/** Hermes-safe replacement for Intl.RelativeTimeFormat on physical Android. */
export function formatRelativeTime(
  rawValue: number,
  unit: RelativeTimeUnit,
  locale = 'fr',
  style: RelativeTimeStyle = 'long',
): string {
  if (!Number.isFinite(rawValue)) return '';
  const value = Math.round(rawValue);
  const language = languageFor(locale);
  if (value === 0) return unit === 'day' ? special[language].today : special[language].now;
  if (unit === 'day' && value === -1) return special[language].yesterday;
  if (unit === 'day' && value === 1) return special[language].tomorrow;

  const count = Math.abs(value);
  const label =
    style === 'short' ? shortUnits[language][unit] : longUnits[language][unit][count === 1 ? 0 : 1];
  const amount =
    language === 'ja' || language === 'ko' || language === 'zh'
      ? `${count}${label}`
      : `${count} ${label}`;

  switch (language) {
    case 'de':
      return `${value < 0 ? 'vor' : 'in'} ${amount}`;
    case 'es':
      return value < 0 ? `hace ${amount}` : `dentro de ${amount}`;
    case 'fr':
      return `${value < 0 ? 'il y a' : 'dans'} ${amount}`;
    case 'it':
      return value < 0 ? `${amount} fa` : `tra ${amount}`;
    case 'ja':
      return `${amount}${value < 0 ? '前' : '後'}`;
    case 'ko':
      return `${amount} ${value < 0 ? '전' : '후'}`;
    case 'pt':
      return `${value < 0 ? 'há' : 'em'} ${amount}`;
    case 'zh':
      return `${amount}${value < 0 ? '前' : '后'}`;
    default:
      return value < 0 ? `${amount} ago` : `in ${amount}`;
  }
}
