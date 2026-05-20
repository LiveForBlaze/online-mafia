// The lobby room view: header (name + meta), judge slot, seat grid, action buttons.
// Mutation handling and routing concerns are owned by the parent page.

import type { LobbyDetails } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

import { JudgeSlot } from './JudgeSlot.js';
import { SeatGrid } from './SeatGrid.js';

interface LobbyRoomProps {
  lobby: LobbyDetails;
  currentUserId: string;
  onBack: () => void;
  onLeave: () => void;
  onClose: () => void;
  onKick: (userId: string) => void;
  onStart: () => void;
  onFillBots: () => void;
  onClaimJudge: () => void;
  isLeavePending?: boolean;
  isClosePending?: boolean;
  isKickPending?: boolean;
  isStartPending?: boolean;
  isFillBotsPending?: boolean;
  isClaimJudgePending?: boolean;
  errorMessage?: string | null;
}

export function LobbyRoom({
  lobby,
  currentUserId,
  onBack,
  onLeave,
  onClose,
  onKick,
  onStart,
  onFillBots,
  onClaimJudge,
  isLeavePending,
  isClosePending,
  isKickPending,
  isStartPending,
  isFillBotsPending,
  isClaimJudgePending,
  errorMessage,
}: LobbyRoomProps) {
  const isHost = lobby.hostId === currentUserId;
  const judge = lobby.members.find((m) => m.isJudge);
  const playerCount = lobby.members.filter((m) => !m.isJudge).length;
  // Player seats fill independently from the judge slot. The "ready" condition
  // requires BOTH: all 10 player seats taken AND a judge present.
  const allPlayerSeatsFilled = playerCount === lobby.maxMembers - 1;
  const playersNeeded = lobby.maxMembers - 1 - playerCount;
  const judgeMissing = !judge;
  const allSeatsFilled = allPlayerSeatsFilled && !judgeMissing;
  const statusMessage = allSeatsFilled
    ? LOBBY_MESSAGES.room.ready
    : !allPlayerSeatsFilled
      ? LOBBY_MESSAGES.room.waitingFor(playersNeeded)
      : LOBBY_MESSAGES.room.needJudge;

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            {LOBBY_MESSAGES.room.back}
          </Button>
        </div>

        <header>
          <h1 className="text-2xl font-bold text-fg">{lobby.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {LOBBY_MESSAGES.card.host}: {lobby.hostNickname}
            {' · '}
            {LOBBY_MESSAGES.card.membersOf(lobby.memberCount, lobby.maxMembers)}
            {' · '}
            {lobby.isPrivate ? LOBBY_MESSAGES.card.private : LOBBY_MESSAGES.card.public}
          </p>
        </header>

        <JudgeSlot
          judge={judge}
          currentUserId={currentUserId}
          canKick={isHost}
          onKick={onKick}
          isKickPending={isKickPending}
        />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Места</h2>
          <SeatGrid
            members={lobby.members}
            currentUserId={currentUserId}
            canKick={isHost}
            onKick={onKick}
            isKickPending={isKickPending}
          />
        </section>

        <section className="rounded-md border border-border bg-card p-4">
          <p className="text-sm text-fg">{statusMessage}</p>
          <p className="mt-1 text-xs text-muted">Игроков на местах: {playerCount} / 10</p>
        </section>

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {isHost && (
            <>
              <Button
                onClick={onStart}
                disabled={!allSeatsFilled || isStartPending}
                title={!allSeatsFilled ? statusMessage : undefined}
              >
                {LOBBY_MESSAGES.room.startGame}
              </Button>
              {!allPlayerSeatsFilled && (
                <Button variant="secondary" onClick={onFillBots} disabled={isFillBotsPending}>
                  {isFillBotsPending
                    ? LOBBY_MESSAGES.room.fillingBots
                    : LOBBY_MESSAGES.room.fillBots}
                </Button>
              )}
              <Button variant="secondary" onClick={onClose} disabled={isClosePending}>
                {LOBBY_MESSAGES.room.close}
              </Button>
            </>
          )}
          {judgeMissing && (
            <Button variant="secondary" onClick={onClaimJudge} disabled={isClaimJudgePending}>
              {isClaimJudgePending
                ? LOBBY_MESSAGES.room.becomingJudge
                : LOBBY_MESSAGES.room.becomeJudge}
            </Button>
          )}
          <Button variant="ghost" onClick={onLeave} disabled={isLeavePending}>
            {isLeavePending ? LOBBY_MESSAGES.room.leaving : LOBBY_MESSAGES.room.leave}
          </Button>
        </div>
      </div>
    </main>
  );
}
