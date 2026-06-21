// Compact control that switches the UI language. Persists the choice via the
// LanguageDetector's localStorage cache (key 'mafia.locale'). Sits in the top
// nav next to the user chip.
//
// Implemented as a native <select> (wrapped behind a globe + chevron) rather
// than a custom listbox: the browser gives us full keyboard support
// (Arrow keys / Home / End / type-ahead / Enter / Escape) and correct ARIA
// semantics for free, which the previous hand-rolled dropdown faked with a
// bare role="listbox" and plain buttons.

import { ChevronDown, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn.js';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/index.js';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage as Locale) || 'ru';

  function pick(locale: Locale) {
    void i18n.changeLanguage(locale);
  }

  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-2 py-1',
        'text-xs uppercase tracking-wider text-muted',
        'focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-bg',
      )}
    >
      <Globe size={14} aria-hidden="true" />
      <span aria-hidden="true">{current}</span>
      <ChevronDown size={14} aria-hidden="true" className="text-muted" />
      <select
        value={current}
        onChange={(event) => pick(event.target.value as Locale)}
        aria-label={t('common.language')}
        title={t('common.language')}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent text-transparent opacity-0 focus:outline-none"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale} className="text-fg">
            {t(`languages.${locale}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
