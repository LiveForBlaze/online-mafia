// The lobby room view: header card (name + meta + share), judge slot, seat grid,
// status / progress block, and action buttons. Mutation handling and routing
// concerns are owned by the parent page.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LobbyDetails, Role } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { formatRelativeTime } from '@/features/lobby/lib/relativeTime.js';

import { JudgeSlot } from './JudgeSlot.js';
import { SeatGrid } from './SeatGrid.js';

interface LobbyRoomProps {
  lobby: LobbyDetails;
  currentUserId: string;
  onLeave: () => void;
  onClose: () => void;
  onKick: (userId: string) => void;
  onStart: () => void;
  onFillBots: () => void;
  onPreassignRole?: (userId: string, role: Role | null) => void;
  isLeavePending?: boolean;
  isClosePending?: boolean;
  isKickPending?: boolean;
  isStartPending?: boolean;
  isFillBotsPending?: boolean;
  isPreassignPending?: boolean;
  errorMessage?: string | null;
}

export function LobbyRoom({
  lobby,
  currentUserId,
  onLeave,
  onClose,
  onKick,
  onStart,
  onFillBots,
  onPreassignRole,
  isLeavePending,
  isClosePending,
  isKickPending,
  isStartPending,
  isFillBotsPending,
  isPreassignPending,
  errorMessage,
}: LobbyRoomProps) {
  const { t } = useTranslation();
  const isHost = lobby.hostId === currentUserId;
  const judge = lobby.members.find((m) => m.isJudge);
  const playerCount = lobby.members.filter((m) => !m.isJudge).length;
  const totalPlayerSeats = lobby.maxMembers - 1;
  // Player seats fill independently from the judge slot. The "ready" condition
  // requires BOTH: all 10 player seats taken AND a judge present.
  const allPlayerSeatsFilled = playerCount === totalPlayerSeats;
  const playersNeeded = totalPlayerSeats - playerCount;
  const judgeMissing = !judge;
  const allSeatsFilled = allPlayerSeatsFilled && !judgeMissing;
  const statusMessage = allSeatsFilled
    ? t('lobby.room.ready')
    : !allPlayerSeatsFilled
      ? t('lobby.room.waitingFor', { n: playersNeeded })
      : t('lobby.room.needJudge');

  const progressPct = Math.min(
    100,
    Math.round((playerCount / Math.max(1, totalPlayerSeats)) * 100),
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <LobbyHeaderCard lobby={lobby} />

        <JudgeSlot
          judge={judge}
          currentUserId={currentUserId}
          canKick={isHost}
          onKick={onKick}
          isKickPending={isKickPending}
        />

        <section className="rounded-md border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t('lobby.room.seatsTitle')}
          </h2>
          <SeatGrid
            members={lobby.members}
            currentUserId={currentUserId}
            canKick={isHost}
            onKick={onKick}
            isKickPending={isKickPending}
            onPreassignRole={isHost ? onPreassignRole : undefined}
            isPreassignPending={isPreassignPending}
          />
        </section>

        <section className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg">
              {t('lobby.room.seatsProgress', { current: playerCount, total: totalPlayerSeats })}
            </p>
            <p className="text-xs text-muted text-right">{statusMessage}</p>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-card-deep"
            role="progressbar"
            aria-valuenow={playerCount}
            aria-valuemin={0}
            aria-valuemax={totalPlayerSeats}
          >
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className={cn('text-xs', judge ? 'text-success' : 'text-danger')}>
            {judge
              ? t('lobby.room.judgePresent', { nickname: judge.nickname })
              : t('lobby.room.judgeAbsent')}
          </p>
        </section>

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {isHost && (
              <>
                <Button
                  onClick={onStart}
                  disabled={!allSeatsFilled || isStartPending}
                  title={!allSeatsFilled ? statusMessage : undefined}
                >
                  {t('lobby.room.startGame')}
                </Button>
                {!allPlayerSeatsFilled && (
                  <Button variant="secondary" onClick={onFillBots} disabled={isFillBotsPending}>
                    {isFillBotsPending ? t('lobby.room.fillingBots') : t('lobby.room.fillBots')}
                  </Button>
                )}
                <Button variant="secondary" onClick={onClose} disabled={isClosePending}>
                  {t('lobby.room.close')}
                </Button>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={onLeave}
            disabled={isLeavePending}
            className="text-danger hover:bg-danger/10"
          >
            {isLeavePending ? t('lobby.room.leaving') : t('lobby.room.leave')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Header card — lobby name, info chips, and a share button. Kept in this file so
// the room composition stays readable in one place.
function LobbyHeaderCard({ lobby }: { lobby: LobbyDetails }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard might be unavailable (insecure context, denied permission).
      // Silent fail keeps the button non-disruptive — user can copy the URL manually.
    }
  }

  return (
    <header className="rounded-md border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-fg break-words">{lobby.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone={lobby.isPrivate ? 'warning' : 'success'}>
              {lobby.isPrivate ? t('lobby.card.private') : t('lobby.card.public')}
            </Chip>
            <Chip>
              {t('lobby.room.membersChip', {
                current: lobby.memberCount,
                max: lobby.maxMembers,
              })}
            </Chip>
            <Chip>
              <ClockIcon />
              <span>
                {t('lobby.room.createdAgo', { rel: formatRelativeTime(lobby.createdAt) })}
              </span>
            </Chip>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleShare}
          aria-label={t('lobby.room.share')}
          className="shrink-0"
        >
          {copied ? <CheckIcon /> : <LinkIcon />}
          <span className="hidden sm:inline">
            {copied ? t('lobby.room.shareCopied') : t('lobby.room.share')}
          </span>
        </Button>
      </div>
    </header>
  );
}

// Small pill used in the header card. Default is neutral; `tone` switches to a
// status-coloured background so private/public reads at a glance.
function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-success/15 text-success border-success/30'
      : tone === 'warning'
        ? 'bg-warning/15 text-fg border-warning/40'
        : 'bg-card-deep text-muted border-border';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
