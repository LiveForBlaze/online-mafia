// Info tile — 12th cell of the grid, opposite the judge.
//
// Shows the current phase, day number, and phase-specific context (current speaker,
// nominations, vote progress, check results). Personal prompts (your check result)
// are still surfaced here for the relevant viewer.

import { useTranslation } from 'react-i18next';

import { GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
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
  const { t } = useTranslation();
  const { secondsLeft, expired, hasTimer } = useCountdown(state.phaseDeadline);

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted">
        {state.dayNumber > 0 ? t('game.ui.day', { n: state.dayNumber }) : t('game.ui.match')}
      </p>
      <p className="text-base sm:text-lg font-semibold text-fg leading-tight">
        {t(`game.phase.${state.phase}`)}
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
  const { t } = useTranslation();
  if (state.status === 'finished') {
    return (
      <div className="text-base text-fg">
        {state.winner &&
          t('game.ui.winner', { team: t(`game.team.${state.winner}`).toLowerCase() })}
      </div>
    );
  }

  switch (state.phase) {
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return (
        <div className="text-sm text-muted">
          {viewerRole && (
            <>
              {t('game.ui.yourRole')}:{' '}
              <span className="text-fg text-base font-semibold">
                {t(`game.role.${viewerRole}`)}
              </span>
            </>
          )}
        </div>
      );

    case GAME_PHASE.NIGHT_ZERO:
      return (
        <div className="text-sm text-muted">
          {(viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) &&
            t('game.ui.mafiaTeamHighlight')}
        </div>
      );

    case GAME_PHASE.DAY_SPEECH:
      return (
        <div className="space-y-2">
          {state.currentSpeakerSeat !== null && (
            <p
              className={cn(
                'text-xl sm:text-2xl font-bold leading-tight',
                state.farewellSeat !== null ? 'text-warning' : 'text-fg',
              )}
            >
              {state.farewellSeat !== null
                ? t('game.ui.farewellSpeaker', { seat: state.currentSpeakerSeat })
                : t('game.ui.currentSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="text-sm text-muted">
              {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
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
            {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
          </p>
          {viewerIsAlive && hasVoted && (
            <p className="text-base text-success">{t('game.ui.voted')}</p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafiaTeam = viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON;
      return (
        <div className="space-y-2">
          {viewerIsAlive && isMafiaTeam ? (
            <p className="text-sm text-muted">{t('game.ui.chooseMafiaTarget')}</p>
          ) : (
            <p className="text-sm text-muted">{t('game.ui.waitingForOthers')}</p>
          )}
          {state.pendingMafiaTargetSeat !== null && (
            <p className="text-xl sm:text-2xl font-bold text-danger leading-tight">
              {t('game.ui.mafiaTarget', { seat: state.pendingMafiaTargetSeat })}
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
          prompt={t('game.ui.chooseDonTarget')}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckBody
          kind="sheriff"
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={t('game.ui.chooseSheriffTarget')}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <div className="text-lg sm:text-xl font-semibold text-fg leading-tight">
          {state.lastNightVictimSeat !== null
            ? t('game.ui.morningVictim', { seat: state.lastNightVictimSeat })
            : t('game.ui.nobodyDied')}
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
  const { t } = useTranslation();
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
      label = checkResult.result ? t('game.ui.sheriffCheckBlack') : t('game.ui.sheriffCheckRed');
      labelClass = checkResult.result ? 'text-fg' : 'text-danger';
    } else {
      label = checkResult.result ? t('game.ui.donCheckSheriff') : t('game.ui.donCheckNotSheriff');
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
      <p className="text-muted">{allowed ? prompt : t('game.ui.waitingForOthers')}</p>
    </div>
  );
}
