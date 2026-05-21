// i18n bootstrap. Run once from main.tsx before React mounts so the very
// first render already has the right language. Detection order:
//   1) explicit user choice in localStorage
//   2) navigator.language (browser preference)
//   3) fall back to Russian
//
// New strings are added to `src/i18n/locales/*.json` and accessed via
//   const { t } = useTranslation();
//   t('nav.lobby')

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import be from './locales/be.json';
import en from './locales/en.json';
import ka from './locales/ka.json';
import kk from './locales/kk.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';

export const SUPPORTED_LOCALES = ['ru', 'uk', 'be', 'en', 'ka', 'kk'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      uk: { translation: uk },
      be: { translation: be },
      en: { translation: en },
      ka: { translation: ka },
      kk: { translation: kk },
    },
    fallbackLng: 'ru',
    supportedLngs: SUPPORTED_LOCALES,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'mafia.locale',
      caches: ['localStorage'],
    },
  });

export default i18n;
