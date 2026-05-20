// Info tile — 12th cell of the grid, opposite the judge.
//
// Shows the current phase, day number, and phase-specific context (current speaker,
// nominations, vote progress, check results). Personal prompts (your check result)
// are still surfaced here for the relevant viewer.

import { GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { GAME_MESSAGES } from '@/features/game/messages.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';

interface InfoTileProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
}

export function InfoTile({ state, viewerRole, viewerSeat, viewerIsAlive }: InfoTileProps) {
  return (
    // Same dark surface as the JudgeTile so the two centre cells form a unified
    // "control zone" clearly distinct from the surrounding video tiles.
    <div className="relative w-full h-full min-h-0 rounded-md border border-border bg-card-deep p-3 overflow-auto flex flex-col gap-2">
      <InfoGlyph />
      <Header state={state} />
      <Body
        state={state}
        viewerRole={viewerRole}
        viewerSeat={viewerSeat}
        viewerIsAlive={viewerIsAlive}
      />
    </div>
  );
}

function InfoGlyph() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted/20 text-muted text-xs font-semibold"
    >
      i
    </span>
  );
}

function Header({ state }: { state: GameStateProjected }) {
  const { secondsLeft, expired, hasTimer } = useCountdown(state.phaseDeadline);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted">
        {state.dayNumber > 0 ? GAME_MESSAGES.ui.day(state.dayNumber) : 'Партия'}
      </p>
      <p className="text-sm font-semibold text-fg leading-tight">
        {GAME_MESSAGES.phase[state.phase]}
      </p>
      {hasTimer && (
        <p
          className={cn(
            'mt-1 text-2xl font-bold tabular-nums leading-none',
            expired ? 'text-danger' : 'text-fg',
          )}
        >
          {formatCountdown(secondsLeft)}
        </p>
      )}
    </div>
  );
}

function Body({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
}: {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
}) {
  if (state.status === 'finished') {
    return (
      <div className="text-xs text-fg">
        {state.winner && GAME_MESSAGES.ui.winner(GAME_MESSAGES.team[state.winner])}
      </div>
    );
  }

  switch (state.phase) {
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return (
        <div className="text-xs text-muted">
          {viewerRole && (
            <>
              {GAME_MESSAGES.ui.yourRole}:{' '}
              <span className="text-fg font-medium">{GAME_MESSAGES.role[viewerRole]}</span>
            </>
          )}
        </div>
      );

    case GAME_PHASE.NIGHT_ZERO:
      return (
        <div className="text-xs text-muted">
          {(viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) && 'Ваша команда подсвечена'}
        </div>
      );

    case GAME_PHASE.DAY_SPEECH:
      return (
        <div className="text-xs space-y-1">
          {state.currentSpeakerSeat !== null && (
            <p className="text-fg">{GAME_MESSAGES.ui.currentSpeaker(state.currentSpeakerSeat)}</p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="text-muted">
              {GAME_MESSAGES.ui.nominations}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_VOTE: {
      const hasVoted =
        viewerSeat !== null &&
        Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));
      return (
        <div className="text-xs space-y-1">
          <p className="text-muted">
            {GAME_MESSAGES.ui.nominations}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
          </p>
          {viewerIsAlive && hasVoted && <p className="text-success">{GAME_MESSAGES.ui.voted}</p>}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafiaTeam = viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON;
      return (
        <div className="text-xs space-y-1">
          {viewerIsAlive && isMafiaTeam ? (
            <p className="text-muted">{GAME_MESSAGES.ui.chooseMafiaTarget}</p>
          ) : (
            <p className="text-muted">{GAME_MESSAGES.ui.waitingForOthers}</p>
          )}
          {state.pendingMafiaTargetSeat !== null && (
            <p className="text-danger">
              {GAME_MESSAGES.ui.mafiaTarget(state.pendingMafiaTargetSeat)}
            </p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_DON:
      return (
        <NightCheckBody
          allowed={viewerRole === ROLE.DON && viewerIsAlive}
          prompt={GAME_MESSAGES.ui.chooseDonTarget}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckBody
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={GAME_MESSAGES.ui.chooseSheriffTarget}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <div className="text-xs text-muted">
          {state.lastNightVictimSeat !== null
            ? GAME_MESSAGES.ui.morningVictim(state.lastNightVictimSeat)
            : GAME_MESSAGES.ui.nobodyDied}
        </div>
      );

    default:
      return null;
  }
}

function NightCheckBody({
  allowed,
  prompt,
  checkResult,
}: {
  allowed: boolean;
  prompt: string;
  checkResult: GameStateProjected['myCheckResult'];
}) {
  return (
    <div className="text-xs space-y-1">
      <p className="text-muted">{allowed ? prompt : GAME_MESSAGES.ui.waitingForOthers}</p>
      {checkResult && (
        <p className={cn('font-medium', checkResult.result ? 'text-danger' : 'text-success')}>
          №{checkResult.targetSeat}:{' '}
          {checkResult.result ? GAME_MESSAGES.ui.checkPositive : GAME_MESSAGES.ui.checkNegative}
        </p>
      )}
    </div>
  );
}
