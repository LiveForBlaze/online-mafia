// Info tile — 12-я ячейка сетки стола, напротив судьи.
//
// Это «центр управления»: фаза, день, таймер и контекстная информация по
// текущей фазе. Само тело каждой фазы вынесено в components/phases/* —
// здесь только маршрутизация по state.phase. Полезно открывать этот файл,
// когда хочется понять «что игрок видит сейчас», и сразу переходить в
// соответствующий phases/-файл за деталями.

import { useTranslation } from 'react-i18next';

import { GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { GameOverReview } from '@/features/game/components/GameOverReview.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';

import { BestMoveForm } from './phases/BestMoveForm.js';
import { DayVoteIntroBody } from './phases/DayVoteIntroBody.js';
import { JudgeStepControls } from './phases/JudgeStepControls.js';
import { LiftVoteBody } from './phases/LiftVoteBody.js';
import { NightCheckBody } from './phases/NightCheckBody.js';
import { VoteBody } from './phases/VoteBody.js';
import { VotesBreakdown } from './phases/VotesBreakdown.js';

interface InfoTileProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}

export function InfoTile({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: InfoTileProps) {
  return (
    // Внутренний скролл оставляем — иначе очень длинный список голосов
    // ломает layout всей сетки. Но padding ужали с p-3 до p-2 (4px → 8px
    // вокруг), и gap-2 → gap-1.5 — это освобождает место под CTA + tally
    // без скролла на типовых ноутбучных разрешениях. По жалобе #11
    // «отступы можно убрать, важная инфа под скроллом».
    <div className="relative w-full h-full min-h-0 rounded-md border border-border bg-card-deep p-2 overflow-auto flex flex-col gap-1.5">
      <InfoGlyph />
      <Header state={state} />
      <Body
        state={state}
        viewerRole={viewerRole}
        viewerSeat={viewerSeat}
        viewerIsAlive={viewerIsAlive}
        viewerIsJudge={viewerIsJudge}
      />
      {viewerIsJudge && <JudgeStepControls state={state} />}
    </div>
  );
}

// ---- Заголовок: день, фаза, таймер ----

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
  const { secondsLeft, expired, warning, hasTimer } = useCountdown(
    state.phaseDeadline,
    state.phaseStartedAt,
  );
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
            expired ? 'text-danger' : warning ? 'text-warning' : 'text-fg',
          )}
        >
          {formatCountdown(secondsLeft)}
        </p>
      )}
    </div>
  );
}

// ---- Тело по фазам ----

interface BodyProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}

function Body({ state, viewerRole, viewerSeat, viewerIsAlive, viewerIsJudge }: BodyProps) {
  const { t } = useTranslation();
  if (state.status === 'finished') return <GameOverReview state={state} />;

  switch (state.phase) {
    case GAME_PHASE.PLAYER_INTRODUCTION:
      return <p className="text-sm text-muted">{t('game.ui.introHint')}</p>;

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

    case GAME_PHASE.DAY_SPEECH: {
      const isFirstNightVictim =
        viewerSeat !== null &&
        state.farewellSeat === viewerSeat &&
        state.farewellSeat === state.currentSpeakerSeat &&
        state.dayNumber === 1;
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
          {isFirstNightVictim && <BestMoveForm state={state} viewerSeat={viewerSeat!} />}
        </div>
      );
    }

    case GAME_PHASE.DAY_VOTE_INTRO:
      return <DayVoteIntroBody state={state} />;

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
      return (
        <VoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
        />
      );

    case GAME_PHASE.DAY_SHOOTOUT:
      return (
        <div className="space-y-2">
          {state.currentSpeakerSeat !== null && (
            <p className="text-xl sm:text-2xl font-bold text-warning leading-tight">
              {t('game.ui.shootoutSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.tiedSeats.length > 0 && (
            <p className="text-sm text-muted">
              {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_LIFT_VOTE:
      return (
        <LiftVoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
        />
      );

    case GAME_PHASE.DAY_LAST_WORD:
      return (
        <div className="space-y-2">
          {state.lastWordSeat !== null && (
            <p className="text-xl sm:text-2xl font-extrabold text-warning leading-tight">
              {t('game.ui.lastWordSpeaker', { seat: state.lastWordSeat })}
            </p>
          )}
          <VotesBreakdown state={state} />
        </div>
      );

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafia = viewerRole === ROLE.MAFIA;
      return (
        <div className="space-y-2">
          {viewerIsAlive && isMafia ? (
            <p className="text-sm text-muted">{t('game.ui.chooseMafiaTarget')}</p>
          ) : (
            <p className="text-sm text-muted">{t('game.ui.waitingForOthers')}</p>
          )}
          {isMafia && state.myMafiaVote !== null && (
            <p className="text-base font-semibold text-success">
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
          // Результат проверки показываем только тому, кто её делал.
          // Иначе у дона в фазе NIGHT_SHERIFF был виден его старый
          // donCheck, отрисованный шерифскими словами → бред.
          checkResult={viewerRole === ROLE.DON ? state.myCheckResult : null}
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckBody
          kind="sheriff"
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={t('game.ui.chooseSheriffTarget')}
          checkResult={viewerRole === ROLE.SHERIFF ? state.myCheckResult : null}
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
