// Tiny relative-time formatter for the lobby list.
// Picks language from the i18next runtime. East-Slavic locales (ru/uk/be) use
// pluralized catalog entries (one/few/many/other). English uses Intl.RelativeTimeFormat
// because the rules are simple and we get the canonical strings for free.
//
// Intentionally dependency-free for the catalog path — we don't want to pull in
// a date library for a couple of human-readable strings.

import i18n from '@/i18n/index.js';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type SupportedLang = 'ru' | 'uk' | 'be' | 'en';

function resolveLang(): SupportedLang {
  const raw = i18n.resolvedLanguage ?? i18n.language ?? 'ru';
  const lang = raw.split('-')[0]?.toLowerCase();
  if (lang === 'uk' || lang === 'be' || lang === 'en') return lang;
  return 'ru';
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return '';

  const lang = resolveLang();
  const diffSec = Math.max(0, Math.floor((now.getTime() - created) / 1000));

  if (lang === 'en') return formatEn(diffSec);
  return formatViaCatalog(diffSec);
}

// Catalog-driven formatter for ru / uk / be. The t() function picks the right
// plural form (_one / _few / _many / _other) based on the active language's
// CLDR plural rules.
function formatViaCatalog(diffSec: number): string {
  const t = i18n.t.bind(i18n);
  if (diffSec < 30) return t('relative_time.just_now');
  if (diffSec < MINUTE) return t('relative_time.less_than_minute');

  if (diffSec < HOUR) {
    const minutes = Math.floor(diffSec / MINUTE);
    return t('relative_time.minutes', { count: minutes });
  }

  if (diffSec < DAY) {
    const hours = Math.floor(diffSec / HOUR);
    return t('relative_time.hours', { count: hours });
  }

  const days = Math.floor(diffSec / DAY);
  if (days === 1) return t('relative_time.yesterday');
  return t('relative_time.days', { count: days });
}

// English path: Intl.RelativeTimeFormat handles plural agreement; we only
// surface the catalog strings for the special-case labels ("just now", "yesterday").
function formatEn(diffSec: number): string {
  const t = i18n.t.bind(i18n);
  if (diffSec < 30) return t('relative_time.just_now');
  if (diffSec < MINUTE) return t('relative_time.less_than_minute');

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (diffSec < HOUR) {
    const minutes = Math.floor(diffSec / MINUTE);
    return rtf.format(-minutes, 'minute');
  }

  if (diffSec < DAY) {
    const hours = Math.floor(diffSec / HOUR);
    return rtf.format(-hours, 'hour');
  }

  const days = Math.floor(diffSec / DAY);
  // Intl handles "yesterday" via numeric: 'auto' on its own; we don't need
  // the catalog shortcut here, but keep it for parity with the East-Slavic path.
  if (days === 1) return t('relative_time.yesterday');
  return rtf.format(-days, 'day');
}

// Backwards-compatible alias for existing callers. New code should use
// formatRelativeTime() directly.
export const formatRelativeTimeRu = formatRelativeTime;
