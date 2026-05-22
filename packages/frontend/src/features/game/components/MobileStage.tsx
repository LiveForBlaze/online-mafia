// Compact stage strip used at the top of the game screen on mobile.
// Mirrors what InfoTile shows on desktop — phase, day, timer, speaker,
// check result — but laid out as a 2-row strip instead of a square tile.
//
// Hides the judge entirely (mobile players don't need a tile for them) and
// promotes whatever is the most important information for the current phase
// to large type (e.g. the ЧЁРНЫЙ / КРАСНЫЙ check result).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { GameOverReview } from '@/features/game/components/GameOverReview.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface MobileStageProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}

export function MobileStage({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: MobileStageProps) {
  const { t } = useTranslation();
  const { secondsLeft, expired, hasTimer } = useCountdown(state.phaseDeadline);

  return (
    <section className="rounded-md border border-border bg-card-deep p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-fg leading-tight truncate">
          {t(`game.phase.${state.phase}`)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {state.dayNumber > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {t('game.ui.day', { n: state.dayNumber })}
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
        viewerIsJudge={viewerIsJudge}
      />
    </section>
  );
}

function StageBody({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: MobileStageProps) {
  const { t } = useTranslation();
  if (state.status === 'finished') {
    return <GameOverReview state={state} />;
  }

  switch (state.phase) {
    case GAME_PHASE.PLAYER_INTRODUCTION:
      return <p className="text-sm text-muted">{t('game.ui.introHint')}</p>;

    case GAME_PHASE.ROLE_DISTRIBUTION:
      return viewerRole ? (
        <p className="text-sm text-muted">
          {t('game.ui.yourRole')}:{' '}
          <span className="text-fg font-semibold">{t(`game.role.${viewerRole}`)}</span>
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
                ? t('game.ui.farewellSpeaker', { seat: state.currentSpeakerSeat })
                : t('game.ui.currentSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="text-xs text-muted">
              {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
      return (
        <MobileVoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
        />
      );

    case GAME_PHASE.DAY_SHOOTOUT:
      return (
        <div className="flex items-baseline gap-2 flex-wrap">
          {state.currentSpeakerSeat !== null && (
            <p className="text-base font-bold text-warning">
              {t('game.ui.shootoutSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.tiedSeats.length > 0 && (
            <p className="text-xs text-muted">
              {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_LAST_WORD:
      return (
        <div className="flex items-baseline gap-2 flex-wrap">
          {state.lastWordSeat !== null && (
            <p className="text-base font-bold text-warning">
              {t('game.ui.lastWordSpeaker', { seat: state.lastWordSeat })}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_LIFT_VOTE:
      return (
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm text-fg">
            {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
          </p>
          <p className="text-xs font-mono text-muted">
            {t('game.ui.liftTally', { yes: state.liftAllTally.yes, no: state.liftAllTally.no })}
          </p>
          {state.myLiftAllVote !== null && (
            <p className="text-xs text-success">
              {state.myLiftAllVote ? t('game.ui.liftMyVoteYes') : t('game.ui.liftMyVoteNo')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafia = viewerRole === ROLE.MAFIA;
      return (
        <div className="space-y-0.5">
          {viewerIsAlive && isMafia ? (
            <p className="text-xs text-muted">{t('game.ui.chooseMafiaTarget')}</p>
          ) : (
            <p className="text-xs text-muted">{t('game.ui.waitingForOthers')}</p>
          )}
          {isMafia && state.myMafiaVote !== null && (
            <p className="text-sm font-semibold text-success">
              {t('game.ui.myMafiaVote', { seat: state.myMafiaVote })}
            </p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_DON: {
      if (state.myCheckResult) {
        const label = state.myCheckResult.result
          ? t('game.ui.donCheckSheriff')
          : t('game.ui.donCheckNotSheriff');
        const labelClass = state.myCheckResult.result ? 'text-danger' : 'text-fg';
        return (
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-muted">
              №{state.myCheckResult.targetSeat}
            </span>
            <span className={cn('text-2xl font-extrabold leading-tight', labelClass)}>{label}</span>
          </div>
        );
      }
      return (
        <p className="text-xs text-muted">
          {viewerRole === ROLE.DON && viewerIsAlive
            ? t('game.ui.chooseDonTarget')
            : t('game.ui.waitingForOthers')}
        </p>
      );
    }

    case GAME_PHASE.NIGHT_SHERIFF: {
      if (state.myCheckResult) {
        const label = state.myCheckResult.result
          ? t('game.ui.sheriffCheckBlack')
          : t('game.ui.sheriffCheckRed');
        const labelClass = state.myCheckResult.result ? 'text-fg' : 'text-danger';
        return (
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-muted">
              №{state.myCheckResult.targetSeat}
            </span>
            <span className={cn('text-2xl font-extrabold leading-tight', labelClass)}>{label}</span>
          </div>
        );
      }
      return (
        <p className="text-xs text-muted">
          {viewerRole === ROLE.SHERIFF && viewerIsAlive
            ? t('game.ui.chooseSheriffTarget')
            : t('game.ui.waitingForOthers')}
        </p>
      );
    }

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <p className="text-base font-semibold text-fg">
          {state.lastNightVictimSeat !== null
            ? t('game.ui.morningVictim', { seat: state.lastNightVictimSeat })
            : t('game.ui.nobodyDied')}
        </p>
      );

    default:
      return null;
  }
}

// Compact vote panel for the mobile stage strip — same logic as InfoTile's
// VoteBody, just rendered to fit a single horizontal row with a tap target
// for the "ЗА" button.
function MobileVoteBody({
  state,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: {
  state: GameStateProjected;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const hasVoted =
    viewerSeat !== null && Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));
  const currentCandidate = state.nominationSeats[state.voteRoundIdx];
  const tally = currentCandidate
    ? Object.values(state.votes).filter((c) => c === currentCandidate).length
    : 0;
  const votingClosed = state.voteRoundIdx >= state.nominationSeats.length;
  const canVote =
    !viewerIsJudge &&
    viewerIsAlive &&
    !hasVoted &&
    !votingClosed &&
    currentCandidate !== undefined &&
    viewerSeat !== currentCandidate;

  async function castVote() {
    if (!canVote || pending || currentCandidate === undefined) return;
    setPending(true);
    try {
      await emitGameAction(CLIENT_EVENT.CAST_VOTE, { candidateSeat: currentCandidate });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!votingClosed && currentCandidate !== undefined ? (
        <p className="text-base font-bold text-warning">
          {t('game.ui.voteRoundPrompt', {
            seat: currentCandidate,
            current: state.voteRoundIdx + 1,
            total: state.nominationSeats.length,
          })}
        </p>
      ) : (
        <p className="text-sm text-muted">{t('game.ui.voteClosed')}</p>
      )}
      {!votingClosed && currentCandidate !== undefined && (
        <p className="text-xs font-mono text-muted">
          {t('game.ui.voteRoundTally', { count: tally })}
        </p>
      )}
      {canVote && (
        <Button
          size="sm"
          onClick={castVote}
          disabled={pending}
          className="ml-auto bg-danger hover:bg-danger/90"
        >
          {t('game.ui.voteForButton')}
        </Button>
      )}
      {viewerIsAlive && hasVoted && <p className="text-xs text-success">{t('game.ui.voted')}</p>}
    </div>
  );
}
