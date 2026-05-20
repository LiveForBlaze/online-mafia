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
      <p className="text-xs uppercase tracking-wider text-muted">
        {state.dayNumber > 0 ? GAME_MESSAGES.ui.day(state.dayNumber) : 'Партия'}
      </p>
      <p className="text-base sm:text-lg font-semibold text-fg leading-tight">
        {GAME_MESSAGES.phase[state.phase]}
      </p>
      {hasTimer && (
        <p
          className={cn(
            'mt-2 text-3xl sm:text-4xl font-bold tabular-nums leading-none',
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
      <div className="text-base text-fg">
        {state.winner && GAME_MESSAGES.ui.winner(GAME_MESSAGES.team[state.winner])}
      </div>
    );
  }

  switch (state.phase) {
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return (
        <div className="text-sm text-muted">
          {viewerRole && (
            <>
              {GAME_MESSAGES.ui.yourRole}:{' '}
              <span className="text-fg text-base font-semibold">
                {GAME_MESSAGES.role[viewerRole]}
              </span>
            </>
          )}
        </div>
      );

    case GAME_PHASE.NIGHT_ZERO:
      return (
        <div className="text-sm text-muted">
          {(viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) && 'Ваша команда подсвечена'}
        </div>
      );

    case GAME_PHASE.DAY_SPEECH:
      return (
        <div className="space-y-2">
          {state.currentSpeakerSeat !== null && (
            <p className="text-xl sm:text-2xl font-bold text-fg leading-tight">
              {GAME_MESSAGES.ui.currentSpeaker(state.currentSpeakerSeat)}
            </p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="text-sm text-muted">
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
        <div className="space-y-2">
          <p className="text-lg sm:text-xl font-semibold text-fg leading-tight">
            {GAME_MESSAGES.ui.nominations}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
          </p>
          {viewerIsAlive && hasVoted && (
            <p className="text-base text-success">{GAME_MESSAGES.ui.voted}</p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafiaTeam = viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON;
      return (
        <div className="space-y-2">
          {viewerIsAlive && isMafiaTeam ? (
            <p className="text-sm text-muted">{GAME_MESSAGES.ui.chooseMafiaTarget}</p>
          ) : (
            <p className="text-sm text-muted">{GAME_MESSAGES.ui.waitingForOthers}</p>
          )}
          {state.pendingMafiaTargetSeat !== null && (
            <p className="text-xl sm:text-2xl font-bold text-danger leading-tight">
              {GAME_MESSAGES.ui.mafiaTarget(state.pendingMafiaTargetSeat)}
            </p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_DON:
      return (
        <NightCheckBody
          kind="don"
          allowed={viewerRole === ROLE.DON && viewerIsAlive}
          prompt={GAME_MESSAGES.ui.chooseDonTarget}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckBody
          kind="sheriff"
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={GAME_MESSAGES.ui.chooseSheriffTarget}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <div className="text-lg sm:text-xl font-semibold text-fg leading-tight">
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
  kind,
  allowed,
  prompt,
  checkResult,
}: {
  kind: 'sheriff' | 'don';
  allowed: boolean;
  prompt: string;
  checkResult: GameStateProjected['myCheckResult'];
}) {
  // Once a check has been made, the result is THE thing the player needs to
  // read — make it the dominant element of the tile so it's legible from
  // across the table. The prompt fades to a small caption.
  if (checkResult) {
    // Sheriff and don have different semantics:
    //   sheriff: result=true → target plays for the black team
    //   don:     result=true → target IS the sheriff (red team)
    // Colour the label by the team it names — red word in red, black word
    // in bold white-on-bg — so the meaning reads even when squinted at.
    let label: string;
    let labelClass: string;
    if (kind === 'sheriff') {
      label = checkResult.result
        ? GAME_MESSAGES.ui.sheriffCheckBlack
        : GAME_MESSAGES.ui.sheriffCheckRed;
      labelClass = checkResult.result ? 'text-fg' : 'text-danger';
    } else {
      label = checkResult.result
        ? GAME_MESSAGES.ui.donCheckSheriff
        : GAME_MESSAGES.ui.donCheckNotSheriff;
      labelClass = checkResult.result ? 'text-danger' : 'text-fg';
    }
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs uppercase tracking-wider text-muted">№{checkResult.targetSeat}</p>
        <p
          className={cn(
            'text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight',
            labelClass,
          )}
        >
          {label}
        </p>
      </div>
    );
  }
  return (
    <div className="text-xs">
      <p className="text-muted">{allowed ? prompt : GAME_MESSAGES.ui.waitingForOthers}</p>
    </div>
  );
}
