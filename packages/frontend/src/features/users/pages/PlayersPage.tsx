// Каталог игроков — таблица-лидерборд.
//
// Серверный список приходит уже отсортированным по победам (это дефолт
// бэка), но юзер может пере-сортировать локально по любой колонке: ник,
// игры, победы, поражения, win-rate. Поиск и фильтр по стране тоже
// клиентские — список < 100 элементов на странице.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';

import { COUNTRIES, type PublicUserProfile } from '@mafia/shared';

import { AchievementBadge } from '@/components/ui/AchievementBadge.js';
import { Avatar } from '@/components/ui/Avatar.js';
import { CountryLabel } from '@/components/ui/CountryLabel.js';
import { Input } from '@/components/ui/Input.js';
import { Skeleton } from '@/components/ui/Skeleton.js';
import { cn } from '@/lib/cn.js';
import { usersApi } from '@/features/users/api/users.api.js';
import { userProfilePath } from '@/routes/paths.js';

// Ключи колонок, по которым можно сортировать. У каждой — свой компаратор
// в `compareBy` ниже. Wins-rate считается на лету из числа побед и игр.
type SortKey = 'rank' | 'nickname' | 'games' | 'wins' | 'losses' | 'winRate';
type SortDir = 'asc' | 'desc';

const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 100;

interface Sort {
  key: SortKey;
  dir: SortDir;
}

const DEFAULT_SORT: Sort = { key: 'rank', dir: 'asc' };

export function PlayersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search]);

  const query = useQuery({
    queryKey: ['users', 'list', debouncedSearch],
    queryFn: () => usersApi.list({ search: debouncedSearch || undefined, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const rawUsers = query.data?.users ?? [];

  // Применяем фильтр по стране и сортировку. `rank` берётся из исходного
  // порядка сервера (по победам) — отдельный столбец для контекста.
  const indexed = useMemo(() => rawUsers.map((user, i) => ({ user, rank: i + 1 })), [rawUsers]);

  const filtered = useMemo(() => {
    if (!countryFilter) return indexed;
    return indexed.filter(({ user }) => user.country === countryFilter);
  }, [indexed, countryFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const mul = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const cmp = compareBy(sort.key, a.user, b.user, a.rank, b.rank);
      return cmp * mul;
    });
    return list;
  }, [filtered, sort]);

  const total = query.data?.total ?? 0;

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev.key !== key) {
        // Для числовых колонок логичен порядок «лучшие сверху» (desc).
        // Для имени — алфавит (asc).
        const initialDir: SortDir = key === 'nickname' || key === 'rank' ? 'asc' : 'desc';
        return { key, dir: initialDir };
      }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  }

  const availableCountries = useMemo(() => {
    const present = new Set(rawUsers.map((u) => u.country).filter((c): c is string => !!c));
    return COUNTRIES.filter((c) => present.has(c.code));
  }, [rawUsers]);

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-fg">{t('players.title')}</h1>
          <p className="text-sm text-muted">{t('players.subtitle')}</p>
        </header>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <Input
            type="search"
            placeholder={t('players.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex-1 max-w-md"
            aria-label={t('players.searchPlaceholder')}
          />
          <CountryFilter
            value={countryFilter}
            onChange={setCountryFilter}
            available={availableCountries}
          />
        </div>

        {query.isLoading ? (
          <div
            className="rounded-md border border-border bg-card divide-y divide-border/40"
            aria-hidden="true"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton width={32} height={32} className="rounded-full" />
                <Skeleton height={14} className="flex-1 max-w-[200px]" />
                <Skeleton width={40} height={14} className="ml-auto" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">
            {debouncedSearch || countryFilter ? t('players.empty.search') : t('players.empty.none')}
          </p>
        ) : (
          <>
            <LeaderboardTable rows={sorted} sort={sort} onSort={toggleSort} />
            {total > rawUsers.length && (
              <p className="text-xs text-muted text-center">
                {t('players.shownOf', { shown: rawUsers.length, total })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Таблица ----

interface Row {
  user: PublicUserProfile;
  rank: number;
}

function LeaderboardTable({
  rows,
  sort,
  onSort,
}: {
  rows: Row[];
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted">
          <tr className="border-b border-border">
            <SortableTh sort={sort} sortKey="rank" onSort={onSort} className="w-12">
              #
            </SortableTh>
            <SortableTh sort={sort} sortKey="nickname" onSort={onSort}>
              {t('players.col.nickname')}
            </SortableTh>
            <th className="px-3 py-2 text-left font-medium hidden md:table-cell">
              {t('players.col.country')}
            </th>
            <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">
              {t('players.col.club')}
            </th>
            <SortableTh sort={sort} sortKey="games" onSort={onSort} align="right" className="w-20">
              {t('players.col.games')}
            </SortableTh>
            <SortableTh sort={sort} sortKey="wins" onSort={onSort} align="right" className="w-20">
              {t('players.col.wins')}
            </SortableTh>
            <SortableTh
              sort={sort}
              sortKey="losses"
              onSort={onSort}
              align="right"
              className="w-20 hidden sm:table-cell"
            >
              {t('players.col.losses')}
            </SortableTh>
            <SortableTh
              sort={sort}
              sortKey="winRate"
              onSort={onSort}
              align="right"
              className="w-20"
            >
              {t('players.col.winRate')}
            </SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ user, rank }) => {
            const winRate =
              user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : null;
            return (
              <tr key={user.id} className="border-b border-border/40 last:border-0 hover:bg-bg/60">
                <td className="px-3 py-2 text-xs font-mono text-muted">{rank}</td>
                <td className="px-3 py-2">
                  <Link
                    to={userProfilePath(user.publicCode)}
                    className="flex items-center gap-2 hover:text-accent"
                  >
                    <Avatar avatarUrl={user.avatarUrl} nickname={user.nickname} size={32} />
                    <div className="min-w-0">
                      <p className="font-semibold text-fg truncate flex items-center gap-1">
                        <span className="truncate">{user.nickname}</span>
                        {user.achievements.map((a) => (
                          <AchievementBadge key={a.id} id={a.id} />
                        ))}
                      </p>
                      <p className="text-2xs font-mono text-muted truncate">#{user.publicCode}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted text-xs hidden md:table-cell">
                  <CountryLabel code={user.country} />
                </td>
                <td className="px-3 py-2 text-muted text-xs hidden lg:table-cell truncate max-w-[160px]">
                  {user.primaryClubName ?? '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{user.gamesPlayed}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-fg">
                  {user.wins}
                </td>
                <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
                  {user.losses}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {winRate !== null ? `${winRate}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortableTh({
  sort,
  sortKey,
  onSort,
  children,
  align,
  className,
}: {
  sort: Sort;
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  // aria-sort lets SR users hear "ascending / descending / none" for the
  // active column. Without it, the visual ↑ / ↓ arrow is purely decorative.
  const ariaSort: 'ascending' | 'descending' | 'none' = active
    ? sort.dir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        'px-3 py-2 font-medium select-none',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-fg transition-colors',
          active && 'text-fg',
        )}
      >
        {children}
        <span aria-hidden="true" className="text-2xs w-3 text-right">
          {arrow}
        </span>
      </button>
    </th>
  );
}

// ---- Фильтр по стране ----

function CountryFilter({
  value,
  onChange,
  available,
}: {
  value: string;
  onChange: (code: string) => void;
  available: typeof COUNTRIES;
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-border bg-card px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
      aria-label={t('players.col.country')}
    >
      <option value="">
        {t('common.all')} · {t('players.col.country')}
      </option>
      {available.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c[locale]}
        </option>
      ))}
    </select>
  );
}

// ---- Сортировка ----

function compareBy(
  key: SortKey,
  a: PublicUserProfile,
  b: PublicUserProfile,
  rankA: number,
  rankB: number,
): number {
  switch (key) {
    case 'rank':
      return rankA - rankB;
    case 'nickname':
      return a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' });
    case 'games':
      return a.gamesPlayed - b.gamesPlayed;
    case 'wins':
      return a.wins - b.wins;
    case 'losses':
      return a.losses - b.losses;
    case 'winRate': {
      const wrA = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : -1;
      const wrB = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : -1;
      return wrA - wrB;
    }
    default:
      return 0;
  }
}
