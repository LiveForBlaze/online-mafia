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
import { LobbyChat } from './LobbyChat.js';
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
  onToggleReady: (ready: boolean) => void;
  isLeavePending?: boolean;
  isClosePending?: boolean;
  isKickPending?: boolean;
  isStartPending?: boolean;
  isFillBotsPending?: boolean;
  isPreassignPending?: boolean;
  isReadyPending?: boolean;
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
  onToggleReady,
  isLeavePending,
  isClosePending,
  isKickPending,
  isStartPending,
  isFillBotsPending,
  isPreassignPending,
  isReadyPending,
  errorMessage,
}: LobbyRoomProps) {
  const { t } = useTranslation();
  const isHost = lobby.hostId === currentUserId;
  const judge = lobby.members.find((m) => m.isJudge);
  const playerCount = lobby.members.filter((m) => !m.isJudge).length;
  // maxMembers теперь приходит как число player-слотов (без судьи) — см.
  // toLobbySummary. Раньше тут было `-1`, после изменения формата сервера
  // вычитание лишнее.
  const totalPlayerSeats = lobby.maxMembers;
  // Player seats fill independently from the judge slot. The "ready" condition
  // requires BOTH: all 10 player seats taken AND a judge present.
  const allPlayerSeatsFilled = playerCount === totalPlayerSeats;
  const playersNeeded = totalPlayerSeats - playerCount;
  const judgeMissing = !judge;
  const allSeatsFilled = allPlayerSeatsFilled && !judgeMissing;
  // Every PLAYER must be ready before the host can start. The judge is the
  // one pressing "Start", so they're implicitly ready and not counted here —
  // we'd never gate the host on a flag they own anyway.
  const playerMembers = lobby.members.filter((m) => !m.isJudge);
  const allReady = playerMembers.length > 0 && playerMembers.every((m) => m.isReady);
  const notReadyCount = playerMembers.filter((m) => !m.isReady).length;
  const startEnabled = allSeatsFilled && allReady;
  const statusMessage = !allPlayerSeatsFilled
    ? t('lobby.room.waitingFor', { n: playersNeeded })
    : judgeMissing
      ? t('lobby.room.needJudge')
      : !allReady
        ? t('lobby.room.waitingReady', { n: notReadyCount })
        : t('lobby.room.ready');

  const viewerMember = lobby.members.find((m) => m.userId === currentUserId);
  const viewerIsReady = viewerMember?.isReady ?? false;
  // Judges don't toggle "ready" — they're the ones starting. Hide the
  // button for them so the layout doesn't dangle an unusable control.
  const showReadyButton = Boolean(viewerMember) && !viewerMember?.isJudge;

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

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              {t('lobby.room.seatsTitle')}
            </h2>
            <p className="text-xs text-muted">
              {t('lobby.room.seatCount', { n: totalPlayerSeats })}
            </p>
          </div>
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

        {/* Status + ready button — the ready toggle lives here, outside the
            seat tiles, so the player's attention isn't competing with seat UI.
            Layout: progress on the left, action stacked on the right with the
            caption and the button vertically aligned to each other. */}
        <section className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs uppercase tracking-wider text-muted">
                  {allSeatsFilled ? t('lobby.room.allSeated') : t('lobby.room.waitingPlayers')}
                </p>
                <p className="text-sm font-semibold text-fg tabular-nums">
                  {playerCount} / {totalPlayerSeats}
                </p>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-card-deep"
                role="progressbar"
                aria-valuenow={playerCount}
                aria-valuemin={0}
                aria-valuemax={totalPlayerSeats}
              >
                <div
                  className="h-full bg-danger transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {/* Judge presence is already conveyed by the JudgeSlot card above —
                  showing it again here would be noise. */}
              {!judge && <p className="text-xs text-danger">{t('lobby.room.judgeAbsent')}</p>}
            </div>
            {showReadyButton && (
              // items-center on mobile keeps the column centred under the bar;
              // items-start on sm+ anchors the caption to the button's left
              // edge so they read as one visual unit.
              <div className="flex shrink-0 flex-col items-center gap-1.5 sm:items-start">
                <p className="text-xs text-muted">
                  {allSeatsFilled
                    ? viewerIsReady
                      ? t('lobby.room.youAreReady')
                      : t('lobby.room.youWillBeReady')
                    : t('lobby.room.playersNeeded', { n: playersNeeded })}
                </p>
                <Button
                  size="md"
                  onClick={() => onToggleReady(!viewerIsReady)}
                  disabled={isReadyPending}
                  className={cn(
                    'min-w-[180px] justify-center',
                    viewerIsReady
                      ? 'bg-success hover:bg-success/90 text-white'
                      : 'bg-danger hover:bg-danger/90 text-white',
                  )}
                >
                  {viewerIsReady ? t('lobby.room.markNotReadyShort') : t('lobby.room.markReady')}
                </Button>
              </div>
            )}
          </div>
        </section>

        <LobbyChat lobbyId={lobby.id} viewerUserId={currentUserId} className="h-80" />

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
                  disabled={!startEnabled || isStartPending}
                  title={!startEnabled ? statusMessage : undefined}
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
