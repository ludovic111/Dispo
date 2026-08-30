import * as Localization from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import pt from './locales/pt.json';
import zhHans from './locales/zh-Hans.json';

export const supportedLocales = [
  'fr',
  'de',
  'en',
  'es',
  'it',
  'ja',
  'ko',
  'pt',
  'zh-Hans',
] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const resources = {
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  ja: { translation: ja },
  ko: { translation: ko },
  pt: { translation: pt },
  'zh-Hans': { translation: zhHans },
};

function deviceLocale(): SupportedLocale {
  const locale = Localization.getLocales()[0];
  if (!locale) return 'fr';
  if (locale.languageCode === 'zh') return 'zh-Hans';
  return supportedLocales.find((value) => value === locale.languageCode) ?? 'fr';
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  fallbackLng: 'fr',
  lng: deviceLocale(),
  interpolation: { escapeValue: false },
  resources,
  returnNull: false,
});

export default i18n;
