// Селектор страны.
//
// Поиск по русскому / английскому имени и по ISO-коду. Закрывается по
// Escape и клику снаружи. Сохраняет ISO-2 код, поэтому миграции локалей
// не ломают записи в БД — переименуем «Türkiye» → «Турция» в одной
// константе и все профили обновятся в UI без миграции.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { COUNTRIES, getCountry } from '@mafia/shared';

import { cn } from '@/lib/cn.js';

interface CountrySelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function CountrySelect({ value, onChange, disabled, placeholder }: CountrySelectProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = getCountry(value);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.ru.toLowerCase().includes(q) ||
        c.en.toLowerCase().includes(q),
    );
  }, [search]);

  function pick(code: string | null) {
    onChange(code);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 h-10 text-sm',
          'hover:bg-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className="truncate">
          {selected ? (
            <>
              <span className="mr-1.5">{selected.flag}</span>
              {selected[locale]}
            </>
          ) : (
            <span className="text-muted">{placeholder ?? t('profile.country_placeholder')}</span>
          )}
        </span>
        <span className="text-muted text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
          <div className="p-2 border-b border-border">
            <input
              type="search"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('common.search')}
              className="w-full h-8 rounded-md border border-border bg-bg px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className="w-full text-left px-3 py-1.5 text-sm text-muted hover:bg-bg"
                >
                  {t('profile.country_clear')}
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">{t('common.no_results')}</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => pick(c.code)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-bg',
                      c.code === value && 'bg-bg font-semibold',
                    )}
                  >
                    <span>{c.flag}</span>
                    <span className="flex-1 truncate">{c[locale]}</span>
                    <span className="text-xs text-muted font-mono">{c.code}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
