// Compact dropdown that switches the UI language. Persists the choice via
// the LanguageDetector's localStorage cache (key 'mafia.locale'). Sits in
// the top nav next to the user chip.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn.js';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/index.js';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = (i18n.resolvedLanguage as Locale) || 'ru';

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function pick(locale: Locale) {
    void i18n.changeLanguage(locale);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('common.language')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1',
          'text-xs uppercase tracking-wider text-muted hover:text-fg hover:bg-bg transition',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg',
        )}
      >
        <GlobeIcon />
        <span>{current}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 min-w-[140px] rounded-md border border-border bg-card shadow-lg z-40 py-1"
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <li key={locale}>
              <button
                type="button"
                onClick={() => pick(locale)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm transition',
                  locale === current
                    ? 'bg-bg text-fg font-semibold'
                    : 'text-muted hover:text-fg hover:bg-bg',
                )}
              >
                {t(`languages.${locale}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}
