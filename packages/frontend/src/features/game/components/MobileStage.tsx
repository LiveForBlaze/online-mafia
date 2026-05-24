// Mobile stage — компактная полоса вверху экрана на мобиле.
//
// На десктопе её роль играет InfoTile в центре стола. На телефоне места в
// сетке нет, и мы выносим тот же контекст (фаза, день, таймер, статус) в
// одну строку. Тело каждой фазы — те же `phases/*` компоненты, что и в
// InfoTile, только с `size="mobile"`.

import { useTranslation } from 'react-i18next';

import { GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { GameOverReview } from '@/features/game/components/GameOverReview.js';
import { SelfMediaButtons } from '@/features/game/components/SelfMediaButtons.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';

import { BestMoveForm } from './phases/BestMoveForm.js';
import { DayVoteIntroBody } from './phases/DayVoteIntroBody.js';
import { JudgeStepControls } from './phases/JudgeStepControls.js';
import { LiftVoteBody } from './phases/LiftVoteBody.js';
import { NightCheckBody } from './phases/NightCheckBody.js';
import { VoteBody } from './phases/VoteBody.js';
import { VotesBreakdown } from './phases/VotesBreakdown.js';

interface MobileStageProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}

export function MobileStage(props: MobileStageProps) {
  const { state, viewerIsJudge } = props;
  const { t } = useTranslation();
  const { secondsLeft, expired, warning, hasTimer } = useCountdown(state.phaseDeadline);

  return (
    <section className="rounded-md border border-border bg-card-deep p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-fg leading-tight truncate">
          {t(`game.phase.${state.phase}`)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Микрофон/камера — на десктопе живут на seat-тайлах, на мобиле
              там нет места, поднимаем в шапку. */}
          <SelfMediaButtons />
          {state.dayNumber > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {t('game.ui.day', { n: state.dayNumber })}
            </p>
          )}
          {hasTimer && (
            <p
              className={cn(
                'text-base font-bold tabular-nums leading-none',
                expired ? 'text-danger' : warning ? 'text-warning' : 'text-fg',
              )}
            >
              {formatCountdown(secondsLeft)}
            </p>
          )}
        </div>
      </div>
      <StageBody {...props} />
      {viewerIsJudge && <JudgeStepControls state={state} size="mobile" />}
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
  if (state.status === 'finished') return <GameOverReview state={state} />;

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

    case GAME_PHASE.DAY_SPEECH: {
      const isFirstNightVictim =
        viewerSeat !== null &&
        state.farewellSeat === viewerSeat &&
        state.farewellSeat === state.currentSpeakerSeat &&
        state.dayNumber === 1;
      return (
        <div className="space-y-2">
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
          {isFirstNightVictim && (
            <BestMoveForm state={state} viewerSeat={viewerSeat!} size="mobile" />
          )}
        </div>
      );
    }

    case GAME_PHASE.DAY_VOTE_INTRO:
      return <DayVoteIntroBody state={state} size="mobile" />;

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
      return (
        <VoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
          size="mobile"
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
        <div className="space-y-1">
          {state.lastWordSeat !== null && (
            <p className="text-base font-bold text-warning">
              {t('game.ui.lastWordSpeaker', { seat: state.lastWordSeat })}
            </p>
          )}
          <VotesBreakdown state={state} size="mobile" />
        </div>
      );

    case GAME_PHASE.DAY_LIFT_VOTE:
      return (
        <LiftVoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
          size="mobile"
        />
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

    case GAME_PHASE.NIGHT_DON:
      return (
        <NightCheckBody
          kind="don"
          allowed={viewerRole === ROLE.DON && viewerIsAlive}
          prompt={t('game.ui.chooseDonTarget')}
          checkResult={viewerRole === ROLE.DON ? state.myCheckResult : null}
          size="mobile"
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckBody
          kind="sheriff"
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={t('game.ui.chooseSheriffTarget')}
          checkResult={viewerRole === ROLE.SHERIFF ? state.myCheckResult : null}
          size="mobile"
        />
      );

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
