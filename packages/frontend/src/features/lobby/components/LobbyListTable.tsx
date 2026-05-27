// Лобби-лист в табличном виде. Заменяет стопку карточек LobbyCard на
// плотную таблицу: ID · название · ведущий · прогресс по местам · статус
// · действие. На узких экранах второстепенные колонки скрываются
// (ID / Host / Status), оставляя суть: имя стола, кто-сколько, кнопка.
//
// Клик по строке = join (как у карточек), фокус-друже­любно через
// role="button" + клавиатура.

import type { KeyboardEvent, MouseEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { LobbySummary } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';
import { userProfilePath } from '@/routes/paths.js';

interface LobbyListTableProps {
  lobbies: LobbySummary[];
  onJoin: (lobby: LobbySummary) => void;
  joiningId?: string | null;
}

export function LobbyListTable({ lobbies, onJoin, joiningId }: LobbyListTableProps) {
  const { t } = useTranslation();
  // На одной строке table-header'ы (#, Лобби, Ведущий, Игроки, Статус…)
  // создают визуально пустую таблицу с одним рядом — feedback от
  // дизайнера: «выглядит как баг, как будто что-то не догрузилось».
  // Скрываем header-row когда лобби ровно одно — table-chrome
  // пропорционален содержимому.
  const showHeader = lobbies.length > 1;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div role="table" aria-label={t('lobbyTable.aria')} className="text-sm">
        {/* Header */}
        <div
          role="row"
          className={cn(
            showHeader ? 'hidden sm:grid' : 'hidden',
            'items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-muted',
            'sm:grid-cols-[3rem_minmax(0,1fr)_8rem_8rem_9rem]',
            'md:grid-cols-[3rem_minmax(0,1fr)_14rem_8rem_5rem_7rem]',
          )}
        >
          <span role="columnheader" className="hidden md:block">
            #
          </span>
          <span role="columnheader">{t('lobbyTable.col.lobby')}</span>
          <span role="columnheader" className="hidden md:block">
            {t('lobbyTable.col.host')}
          </span>
          <span role="columnheader">{t('lobbyTable.col.players')}</span>
          <span role="columnheader">{t('lobbyTable.col.status')}</span>
          <span role="columnheader" className="text-right">
            <span className="sr-only">{t('lobbyTable.col.action')}</span>
          </span>
        </div>

        <div className="divide-y divide-border/60">
          {lobbies.map((lobby) => (
            <LobbyRow
              key={lobby.id}
              lobby={lobby}
              isJoining={joiningId === lobby.id}
              onJoin={() => onJoin(lobby)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LobbyRow({
  lobby,
  isJoining,
  onJoin,
}: {
  lobby: LobbySummary;
  isJoining: boolean;
  onJoin: () => void;
}) {
  const { t } = useTranslation();
  const ratio =
    lobby.maxMembers > 0 ? Math.min(1, Math.max(0, lobby.memberCount / lobby.maxMembers)) : 0;
  const percent = Math.round(ratio * 100);
  // Из UUID берём последние 4 hex-символа — короткий человеко-читаемый
  // ID для колонки «#». Не уникальный глобально, но уникальный «в кадре»
  // (на одной странице 100 лобби максимум, коллизий не будет).
  const shortId = lobby.id.replace(/-/g, '').slice(-4);
  const isFull = lobby.memberCount >= lobby.maxMembers;

  function triggerJoin() {
    if (!isJoining) onJoin();
  }
  function handleRowClick(e: MouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented) return;
    triggerJoin();
  }
  function handleRowKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerJoin();
    }
  }

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      aria-label={t('lobby.card.ariaLabel', { name: lobby.name, host: lobby.hostNickname })}
      className={cn(
        'group cursor-pointer px-4 py-3 transition-colors hover:bg-bg/60 focus:outline-none focus:bg-bg/60',
        'sm:grid sm:items-center sm:gap-3',
        'sm:grid-cols-[3rem_minmax(0,1fr)_8rem_8rem_9rem]',
        'md:grid-cols-[3rem_minmax(0,1fr)_14rem_8rem_5rem_7rem]',
      )}
    >
      {/* # — короткий ID. На очень узких экранах скрываем (значимости
          для юзера ноль, по нему он лобби не ищет). */}
      <span role="cell" className="hidden md:block font-mono text-xs text-muted">
        #{shortId}
      </span>

      {/* Lobby — название + privacy. */}
      <div role="cell" className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm sm:text-base font-semibold text-fg">{lobby.name}</h3>
          {lobby.isPrivate && (
            <span className="shrink-0 rounded-md bg-card-deep px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
              {t('lobby.card.private')}
            </span>
          )}
        </div>
        {/* На мобиле под названием показываем ведущего инлайном —
            отдельная колонка для host'а на мобиле скрыта. */}
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted md:hidden">
          <HostInitial nickname={lobby.hostNickname} />
          <HostLink lobby={lobby} />
        </div>
      </div>

      {/* Host — отдельной колонкой на ≥md. */}
      <div role="cell" className="hidden md:flex items-center gap-2 min-w-0">
        <HostInitial nickname={lobby.hostNickname} />
        <span className="truncate text-sm text-fg/90">
          <HostLink lobby={lobby} />
        </span>
      </div>

      {/* Players — счёт + прогресс-бар. */}
      <div role="cell" className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-xs text-fg">
          {lobby.memberCount}/{lobby.maxMembers}
        </span>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('lobby.card.membersOf', {
            current: lobby.memberCount,
            max: lobby.maxMembers,
          })}
          className="h-1 flex-1 overflow-hidden rounded-full bg-card-deep"
        >
          <div
            className={cn(
              'h-full transition-[width] duration-300',
              isFull ? 'bg-warning' : 'bg-accent',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Status. */}
      <div role="cell" className="hidden sm:flex items-center gap-1.5 text-xs">
        <span
          aria-hidden="true"
          className={cn('h-1.5 w-1.5 rounded-full', isFull ? 'bg-warning' : 'bg-success')}
        />
        <span className={cn(isFull ? 'text-warning' : 'text-success', 'uppercase tracking-wider')}>
          {isFull ? t('lobbyTable.statusFull') : t('lobbyTable.statusOpen')}
        </span>
      </div>

      {/* Action. На мобиле — full-width, на десктопе — авто-ширина и слева
          в ячейке (без text-right): иначе между статусом и кнопкой возникает
          двойная пустота — trailing у статуса плюс leading у action. */}
      <div role="cell" className="mt-2 sm:mt-0">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            triggerJoin();
          }}
          disabled={isJoining || (isFull && !lobby.isViewerMember)}
          variant={lobby.isViewerMember ? 'secondary' : 'primary'}
          size="sm"
          className="w-full sm:w-auto whitespace-nowrap"
        >
          {lobby.isViewerMember ? t('lobby.card.continue') : t('lobby.card.join')}
        </Button>
      </div>
    </div>
  );
}

function HostInitial({ nickname }: { nickname: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card-deep text-[10px] font-semibold uppercase text-muted"
    >
      {extractInitial(nickname)}
    </span>
  );
}

function HostLink({ lobby }: { lobby: LobbySummary }) {
  if (!lobby.hostPublicCode) return <>{lobby.hostNickname}</>;
  return (
    <Link
      to={userProfilePath(lobby.hostPublicCode)}
      onClick={(e) => e.stopPropagation()}
      className="hover:text-fg hover:underline"
    >
      {lobby.hostNickname}
    </Link>
  );
}
