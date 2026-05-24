// Каталог игроков.
//
// Защищён auth-guard'ом (как и весь shell). Поиск дебаунсится локально,
// никакого пагинационного состояния в URL — для V0 простая бесконечная
// прокрутка пока что не нужна, хватит первой страницы 50.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';

import { type PublicUserProfile } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { CountryLabel } from '@/components/ui/CountryLabel.js';
import { Input } from '@/components/ui/Input.js';
import { usersApi } from '@/features/users/api/users.api.js';
import { userProfilePath } from '@/routes/paths.js';

const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 50;

export function PlayersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Дебаунс: не дёргаем сервер на каждый набранный символ.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search]);

  const query = useQuery({
    queryKey: ['users', 'list', debouncedSearch],
    queryFn: () => usersApi.list({ search: debouncedSearch || undefined, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const users = useMemo(() => query.data?.users ?? [], [query.data]);
  const total = query.data?.total ?? 0;

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-fg">{t('players.title')}</h1>
          <p className="text-sm text-muted">{t('players.subtitle')}</p>
        </header>

        <Input
          type="search"
          placeholder={t('players.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-md"
          aria-label={t('players.searchPlaceholder')}
        />

        {query.isLoading ? (
          <p className="text-sm text-muted py-8 text-center">{t('common.loading')}</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">
            {debouncedSearch ? t('players.empty.search') : t('players.empty.none')}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {users.map((user, i) => (
                <PlayerCard key={user.id} user={user} rank={i + 1} />
              ))}
            </ul>
            {total > users.length && (
              <p className="text-xs text-muted text-center">
                {t('players.shownOf', { shown: users.length, total })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlayerCard({ user, rank }: { user: PublicUserProfile; rank: number }) {
  const { t } = useTranslation();
  const winRate = user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : null;
  return (
    <li>
      <Link
        to={userProfilePath(user.publicCode)}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-bg hover:border-accent/40 transition-colors"
      >
        <span className="w-6 text-center text-xs font-mono text-muted shrink-0">{rank}</span>
        <Avatar avatarUrl={user.avatarUrl} nickname={user.nickname} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-fg truncate">{user.nickname}</p>
          <p className="text-xs text-muted truncate flex items-center gap-1">
            {user.country && (
              <>
                <CountryLabel code={user.country} />
                {user.clubName && <span> · </span>}
              </>
            )}
            {user.clubName && <span>{user.clubName}</span>}
            {!user.country && !user.clubName && <span>#{user.publicCode}</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-fg">
            {t('players.statWins', { wins: user.wins, played: user.gamesPlayed })}
          </p>
          {winRate !== null && <p className="text-xs text-muted">{winRate}%</p>}
        </div>
      </Link>
    </li>
  );
}
