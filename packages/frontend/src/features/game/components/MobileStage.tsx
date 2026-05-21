// Compact stage strip used at the top of the game screen on mobile.
// Mirrors what InfoTile shows on desktop — phase, day, timer, speaker,
// check result — but laid out as a 2-row strip instead of a square tile.
//
// Hides the judge entirely (mobile players don't need a tile for them) and
// promotes whatever is the most important information for the current phase
// to large type (e.g. the ЧЁРНЫЙ / КРАСНЫЙ check result).

import { GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';
import { GAME_MESSAGES } from '@/features/game/messages.js';

interface MobileStageProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
}

export function MobileStage({ state, viewerRole, viewerSeat, viewerIsAlive }: MobileStageProps) {
  const { secondsLeft, expired, hasTimer } = useCountdown(state.phaseDeadline);

  return (
    <section className="rounded-md border border-border bg-card-deep p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-fg leading-tight truncate">
          {GAME_MESSAGES.phase[state.phase]}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {state.dayNumber > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {GAME_MESSAGES.ui.day(state.dayNumber)}
            </p>
          )}
          {hasTimer && (
            <p
              className={cn(
                'text-base font-bold tabular-nums leading-none',
                expired ? 'text-danger' : 'text-fg',
              )}
            >
              {formatCountdown(secondsLeft)}
            </p>
          )}
        </div>
      </div>
      <StageBody
        state={state}
        viewerRole={viewerRole}
        viewerSeat={viewerSeat}
        viewerIsAlive={viewerIsAlive}
      />
    </section>
  );
}

function StageBody({ state, viewerRole, viewerSeat, viewerIsAlive }: MobileStageProps) {
  if (state.status === 'finished') {
    return (
      <p className="text-base font-semibold text-fg">
        {state.winner && GAME_MESSAGES.ui.winner(GAME_MESSAGES.team[state.winner])}
      </p>
    );
  }

  // Check result — promoted to the strip's dominant element when set.
  if (state.myCheckResult) {
    const isSheriff = state.phase === GAME_PHASE.NIGHT_SHERIFF;
    const label = isSheriff
      ? state.myCheckResult.result
        ? GAME_MESSAGES.ui.sheriffCheckBlack
        : GAME_MESSAGES.ui.sheriffCheckRed
      : state.myCheckResult.result
        ? GAME_MESSAGES.ui.donCheckSheriff
        : GAME_MESSAGES.ui.donCheckNotSheriff;
    const labelClass = isSheriff
      ? state.myCheckResult.result
        ? 'text-fg'
        : 'text-danger'
      : state.myCheckResult.result
        ? 'text-danger'
        : 'text-fg';
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-xs uppercase tracking-wider text-muted">
          №{state.myCheckResult.targetSeat}
        </span>
        <span className={cn('text-2xl font-extrabold leading-tight', labelClass)}>{label}</span>
      </div>
    );
  }

  switch (state.phase) {
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return viewerRole ? (
        <p className="text-sm text-muted">
          {GAME_MESSAGES.ui.yourRole}:{' '}
          <span className="text-fg font-semibold">{GAME_MESSAGES.role[viewerRole]}</span>
        </p>
      ) : null;

    case GAME_PHASE.DAY_SPEECH:
      return (
        <div className="flex items-baseline gap-2 flex-wrap">
          {state.currentSpeakerSeat !== null && (
            <p
              className={cn(
                'text-base font-bold',
                state.farewellSeat !== null ? 'text-warning' : 'text-fg',
              )}
            >
              {state.farewellSeat !== null
                ? GAME_MESSAGES.ui.farewellSpeaker(state.currentSpeakerSeat)
                : GAME_MESSAGES.ui.currentSpeaker(state.currentSpeakerSeat)}
            </p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="text-xs text-muted">
              {GAME_MESSAGES.ui.nominations}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
    case GAME_PHASE.DAY_SHOOTOUT: {
      const hasVoted =
        viewerSeat !== null &&
        Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));
      return (
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm text-fg">
            {GAME_MESSAGES.ui.nominations}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
          </p>
          {viewerIsAlive && hasVoted && (
            <p className="text-xs text-success">{GAME_MESSAGES.ui.voted}</p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafiaTeam = viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON;
      return (
        <div className="space-y-0.5">
          {viewerIsAlive && isMafiaTeam ? (
            <p className="text-xs text-muted">{GAME_MESSAGES.ui.chooseMafiaTarget}</p>
          ) : (
            <p className="text-xs text-muted">{GAME_MESSAGES.ui.waitingForOthers}</p>
          )}
          {state.pendingMafiaTargetSeat !== null && (
            <p className="text-base font-bold text-danger">
              {GAME_MESSAGES.ui.mafiaTarget(state.pendingMafiaTargetSeat)}
            </p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_DON:
      return (
        <p className="text-xs text-muted">
          {viewerRole === ROLE.DON && viewerIsAlive
            ? GAME_MESSAGES.ui.chooseDonTarget
            : GAME_MESSAGES.ui.waitingForOthers}
        </p>
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <p className="text-xs text-muted">
          {viewerRole === ROLE.SHERIFF && viewerIsAlive
            ? GAME_MESSAGES.ui.chooseSheriffTarget
            : GAME_MESSAGES.ui.waitingForOthers}
        </p>
      );

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <p className="text-base font-semibold text-fg">
          {state.lastNightVictimSeat !== null
            ? GAME_MESSAGES.ui.morningVictim(state.lastNightVictimSeat)
            : GAME_MESSAGES.ui.nobodyDied}
        </p>
      );

    default:
      return null;
  }
}
